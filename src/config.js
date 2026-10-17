import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const roles = JSON.parse(fs.readFileSync(path.join(here, "..", "config", "roles.json"), "utf8"));

  const tokens = {};
  for (const [name, role] of Object.entries(roles)) {
    const token = env[role.tokenEnv];
    if (!token) continue;
    if (token.length < 16) throw new Error(`${role.tokenEnv} must be at least 16 characters`);
    tokens[name] = token;
  }
  if (!tokens.builder) throw new Error("MCP_TOKEN is not set. Refusing to start without authentication.");

  return {
    port: Number(env.PORT || 3000),
    workspace: path.resolve(env.WORKSPACE_ROOT || "./workspace"),
    logDir: path.resolve(env.LOG_DIR || "./logs"),
    roles,
    tokens,
  };
}
