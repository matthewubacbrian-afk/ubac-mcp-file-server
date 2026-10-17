import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createApp } from "./server.js";

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`Startup error: ${e.message}`);
  process.exit(1);
}

const template = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workspace-template");
if (!fs.existsSync(path.join(config.workspace, "projects")) && fs.existsSync(template)) {
  fs.cpSync(template, config.workspace, { recursive: true });
  console.log("Workspace created from workspace-template/");
}

createApp(config).listen(config.port, () => {
  console.log(`MCP file server on :${config.port} | workspace ${config.workspace} | roles: ${Object.keys(config.tokens).join(", ")}`);
});
