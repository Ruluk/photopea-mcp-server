import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotopeaBridge } from "../../src/bridge/websocket-server.js";
import { createServer } from "../../src/server.js";

describe("constrained MCP tools", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let scripts: string[];
  let alerts: string[];
  let echoValues: string[];

  beforeEach(async () => {
    scripts = [];
    alerts = [];
    echoValues = [];
    const bridge = {
      sendActivity: vi.fn(),
      executeScript: vi.fn(async (script: string) => {
        scripts.push(script);
        if (script.includes("app.fonts")) {
          try {
            runInNewContext(script, {
              app: {
                fonts: [
                  { postScriptName: "Arial" },
                  { postScriptName: "Quote'\\Line\nBreak" },
                ],
                echoToOE: (value: unknown) => echoValues.push(String(value)),
              },
              alert: (value: unknown) => alerts.push(String(value)),
            });
          } catch (error) {
            return { success: false, error: String(error) };
          }
          return { success: true, data: echoValues.at(-1) };
        }
        return { success: true, data: "ok" };
      }),
    };
    server = createServer(bridge as unknown as PhotopeaBridge);
    client = new Client({ name: "constrained-tools-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("keeps quote, backslash, and newline font searches as string data", async () => {
    const search = "quote'\\line\nbreak";
    const result = await client.callTool({ name: "photopea_list_fonts", arguments: { search } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toMatchObject([{ type: "text", text: JSON.stringify(["Quote'\\Line\nBreak"]) }]);
    expect(alerts).toEqual([]);
  });

  it("does not execute code embedded in a font search", async () => {
    const result = await client.callTool({
      name: "photopea_list_fonts",
      arguments: { search: "'),(alert('injection marker'),'" },
    });

    expect(result.isError).toBeFalsy();
    expect(alerts).toEqual([]);
    expect(echoValues).toEqual(["[]"]);
  });

  it("rejects unsafe filter and adjustment settings before calling the bridge", async () => {
    const results = await Promise.all([
      client.callTool({
        name: "photopea_apply_filter",
        arguments: { type: "gaussian_blur", settings: { radius: "(app.echoToOE('audit'),2)" } },
      }),
      client.callTool({
        name: "photopea_apply_adjustment",
        arguments: { type: "brightness", settings: { brightness: true } },
      }),
    ]);

    expect(results.every((result) => result.isError)).toBe(true);
    expect(scripts).toEqual([]);
  });
});