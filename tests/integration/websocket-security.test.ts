import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { PhotopeaBridge } from "../../src/bridge/websocket-server.js";

const BRIDGE_PROTOCOL = "photopea-mcp";

interface ConnectionOptions {
  credential?: string | null;
  host?: string;
  origin?: string;
  path?: string;
}

function createClient(browserUrl: URL, options: ConnectionOptions = {}): WebSocket {
  const credential = options.credential === null
    ? null
    : options.credential ?? browserUrl.hash.slice(1);
  const protocols = credential ? [BRIDGE_PROTOCOL, credential] : [BRIDGE_PROTOCOL];
  return new WebSocket(`ws://${browserUrl.host}${options.path ?? "/"}`, protocols, {
    origin: options.origin ?? browserUrl.origin,
    headers: options.host ? { host: options.host } : undefined,
  });
}

function connectionOutcome(client: WebSocket): Promise<"accepted" | "rejected" | "timeout"> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (outcome: "accepted" | "rejected" | "timeout") => {
      clearTimeout(timer);
      resolve(outcome);
    };
    timer = setTimeout(() => finish("timeout"), 1000);
    client.once("open", () => finish("accepted"));
    client.once("unexpected-response", (_request, response) => {
      response.resume();
      finish("rejected");
    });
    client.once("error", () => finish("rejected"));
  });
}

function nextMessage(client: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    client.once("message", (raw) => resolve(JSON.parse(raw.toString())));
  });
}

async function waitUntilReady(bridge: PhotopeaBridge): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (bridge.isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Bridge did not become ready");
}

describe("PhotopeaBridge WebSocket security", () => {
  it("rejects a connection without a bridge credential", async () => {
    const bridge = new PhotopeaBridge(0);
    let client: WebSocket | undefined;

    try {
      await bridge.start();
      client = createClient(new URL(bridge.getBrowserUrl()), { credential: null });
      expect(await connectionOutcome(client)).toBe("rejected");
    } finally {
      client?.terminate();
      await bridge.stop();
    }
  });

  it("rejects wrong credentials, origin, host, and path without disturbing the active peer", async () => {
    const bridge = new PhotopeaBridge(0);
    const clients: WebSocket[] = [];

    try {
      await bridge.start();
      const browserUrl = new URL(bridge.getBrowserUrl());
      const legitimate = createClient(browserUrl);
      clients.push(legitimate);
      expect(await connectionOutcome(legitimate)).toBe("accepted");
      expect(legitimate.protocol).toBe(BRIDGE_PROTOCOL);
      legitimate.send(JSON.stringify({ type: "status", status: "ready" }));
      await waitUntilReady(bridge);

      const invalidClients = [
        createClient(browserUrl, { credential: "wrong-secret" }),
        createClient(browserUrl, { origin: `http://localhost:${browserUrl.port}` }),
        createClient(browserUrl, { host: `localhost:${browserUrl.port}` }),
        createClient(browserUrl, { path: "/unexpected" }),
      ];
      clients.push(...invalidClients);

      for (const client of invalidClients) {
        expect(await connectionOutcome(client)).toBe("rejected");
      }
      expect(bridge.isReady()).toBe(true);

      const commandWait = nextMessage(legitimate);
      const resultPromise = bridge.executeScript("stillConnected();");
      const command = await commandWait;
      legitimate.send(JSON.stringify({
        id: command.id,
        type: "result",
        success: true,
        data: "ok",
        error: null,
      }));
      expect((await resultPromise).success).toBe(true);
    } finally {
      for (const client of clients) client.terminate();
      await bridge.stop();
    }
  });

  it("resets readiness and fails outstanding work when an authenticated peer replaces the client", async () => {
    const bridge = new PhotopeaBridge(0);
    let original: WebSocket | undefined;
    let replacement: WebSocket | undefined;

    try {
      await bridge.start();
      const browserUrl = new URL(bridge.getBrowserUrl());
      original = createClient(browserUrl);
      expect(await connectionOutcome(original)).toBe("accepted");
      original.send(JSON.stringify({ type: "status", status: "ready" }));
      await waitUntilReady(bridge);

      const requestWait = nextMessage(original);
      const oldRequest = bridge.executeScript("oldRequest();");
      await requestWait;

      replacement = createClient(browserUrl);
      expect(await connectionOutcome(replacement)).toBe("accepted");
      expect(bridge.isReady()).toBe(false);
      const oldResult = await oldRequest;
      expect(oldResult.success).toBe(false);
      expect(oldResult.error).toContain("replaced");

      replacement.send(JSON.stringify({ type: "status", status: "ready" }));
      await waitUntilReady(bridge);
      const nextRequestWait = nextMessage(replacement);
      const nextRequest = bridge.executeScript("newRequest();");
      const nextCommand = await nextRequestWait;
      replacement.send(JSON.stringify({
        id: nextCommand.id,
        type: "result",
        success: true,
        data: "new peer",
        error: null,
      }));
      expect((await nextRequest).data).toBe("new peer");
    } finally {
      original?.terminate();
      replacement?.terminate();
      await bridge.stop();
    }
  });

  it("ignores malformed, wrong-type, and stale responses", async () => {
    const bridge = new PhotopeaBridge(0);
    let client: WebSocket | undefined;

    try {
      await bridge.start();
      client = createClient(new URL(bridge.getBrowserUrl()));
      expect(await connectionOutcome(client)).toBe("accepted");
      client.send(JSON.stringify({ type: "status", status: "ready" }));
      await waitUntilReady(bridge);

      const firstMessageWait = nextMessage(client);
      let firstSettled = false;
      const firstResult = bridge.executeScript("first();").then((result) => {
        firstSettled = true;
        return result;
      });
      const secondResult = bridge.executeScript("second();");
      const firstMessage = await firstMessageWait;

      client.send(JSON.stringify({
        id: firstMessage.id,
        type: "file",
        success: true,
        data: "AA==",
        mimeType: "image/png",
        error: null,
      }));
      client.send(JSON.stringify({
        id: firstMessage.id,
        type: "result",
        success: "yes",
        data: "malformed",
        error: null,
      }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(firstSettled).toBe(false);

      const secondMessageWait = nextMessage(client);
      client.send(JSON.stringify({
        id: firstMessage.id,
        type: "result",
        success: true,
        data: "first result",
        error: null,
      }));
      expect((await firstResult).data).toBe("first result");
      const secondMessage = await secondMessageWait;

      let secondSettled = false;
      const observedSecondResult = secondResult.then((result) => {
        secondSettled = true;
        return result;
      });
      client.send(JSON.stringify({
        id: firstMessage.id,
        type: "result",
        success: true,
        data: "stale result",
        error: null,
      }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(secondSettled).toBe(false);

      client.send(JSON.stringify({
        id: secondMessage.id,
        type: "result",
        success: true,
        data: "second result",
        error: null,
      }));
      expect((await observedSecondResult).data).toBe("second result");
    } finally {
      client?.terminate();
      await bridge.stop();
    }
  });
});
