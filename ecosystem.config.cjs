const fs = require("node:fs");
const path = require("node:path");

function fromEnvFile(key) {
  try {
    const m = fs.readFileSync(".env", "utf8").match(new RegExp(`^${key}=([^\\s#]+)`, "m"));
    return m && m[1];
  } catch { return undefined; }
}

function findNgrok() {
  if (process.env.NGROK_PATH) return process.env.NGROK_PATH;
  const names = process.platform === "win32" ? ["ngrok.exe", "ngrok.cmd"] : ["ngrok"];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (dir && fs.existsSync(p)) return p;
    }
  }
  return "ngrok";
}

const domain = process.env.NGROK_DOMAIN || fromEnvFile("NGROK_DOMAIN") || "ardella-ungesticulative-unaptly.ngrok-free.dev";
const port = process.env.PORT || fromEnvFile("PORT") || "3000";

module.exports = {
  apps: [
    {
      name: "mcp-server",
      script: "src/index.js",
      node_args: "--env-file=.env",
      autorestart: true,
      max_restarts: 20,
    },
    {
      name: "mcp-tunnel",
      script: "C:\\ngrok\\ngrok.exe",
      args: `http --domain=${domain} ${port}`,
      interpreter: "none",
      autorestart: true,
    },
  ],
};