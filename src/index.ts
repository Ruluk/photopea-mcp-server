#!/usr/bin/env node
// src/index.ts
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {appendFileSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {PhotopeaBridge} from "./bridge/websocket-server.js";
import {createServer} from "./server.js";
import {findAvailablePort} from "./utils/platform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 4117;
const diagnosticPath = process.env.PHOTOPEA_DIAGNOSTIC_LOG;

function diagnostic(message: string): void {
  if (diagnosticPath) appendFileSync(diagnosticPath, `${message}\n`, {mode: 0o600});
}

diagnostic("process started");

async function main(): Promise<void> {
  diagnostic("starting bridge");
  const port = await findAvailablePort(DEFAULT_PORT);
  const bridge = new PhotopeaBridge(port);

  // Serve the frontend HTML on HTTP GET /
  const httpServer = bridge.getHttpServer();

  // Read from src/frontend so it works whether running from dist/ or src/
  const projectRoot = resolve(__dirname, "..");
  const frontendHtml = readFileSync(
    join(projectRoot, "src", "frontend", "index.html"),
    "utf-8"
  );

  httpServer.on("request", (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      });
      res.end(frontendHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await bridge.start();
  diagnostic(`bridge URL: ${bridge.getBrowserUrl()}`);
  console.error(`Photopea MCP bridge running on http://127.0.0.1:${bridge.getPort()}`);
  console.error(`Open this authenticated browser URL manually if needed: ${bridge.getBrowserUrl()}`);

  // Start MCP server over stdio (browser launches lazily on first tool call)
  const mcpServer = createServer(bridge);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  diagnostic("MCP server ready");
  console.error("Photopea MCP server ready.");
}

main().catch((error) => {
  diagnostic(`fatal error: ${String(error)}`);
  console.error("Fatal error:", error);
  process.exit(1);
});
