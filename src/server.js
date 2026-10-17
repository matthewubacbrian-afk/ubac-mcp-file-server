import crypto from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { makeSandbox } from "./sandbox.js";
import { makeLogger } from "./logger.js";
import { registerTools } from "./tools/index.js";

function roleFor(tokens, presented) {
  if (typeof presented !== "string" || !presented) return null;
  const a = Buffer.from(presented);
  for (const [role, token] of Object.entries(tokens)) {
    const b = Buffer.from(token);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return role;
  }
  return null;
}

export function createApp(config) {
  const sandbox = makeSandbox(config.workspace);
  const logger = makeLogger(config.logDir);
  const app = express();
  app.locals.logger = logger;
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/mcp", (req, res, next) => {
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const role = roleFor(config.tokens, bearer || String(req.query.token || ""));
    if (!role) {
      logger.log({ event: "auth_denied", ip: req.ip });
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.role = role;
    next();
  });

  app.post("/mcp", async (req, res) => {
    const server = new McpServer({ name: "mcp-file-server", version: "1.1.0" });
    registerTools(server, { role: req.role, config, sandbox, logger });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const usePost = (_req, res) => res.status(405).json({ error: "Use POST" });
  app.get("/mcp", usePost);
  app.delete("/mcp", usePost);

  return app;
}
