import test, { before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/server.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "http-"));
const B = "builder-token-0123456789", R = "reviewer-token-0123456789";
let srv, base;

before(async () => {
  const config = loadConfig({ MCP_TOKEN: B, MCP_TOKEN_REVIEWER: R, WORKSPACE_ROOT: path.join(dir, "ws"), LOG_DIR: path.join(dir, "logs") });
  srv = createApp(config).listen(0);
  base = `http://localhost:${srv.address().port}/mcp`;
});
after(() => srv.close());

async function connect(token) {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
}

test("no token or a wrong token gets 401", async () => {
  for (const url of [base, base + "?token=wrong-wrong-wrong-wrong"]) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    assert.equal(r.status, 401);
  }
});

test("token in the URL works", async () => {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}?token=${B}`)));
  assert.ok((await c.listTools()).tools.length >= 8);
  await c.close();
});

test("builder sees all tools, reviewer sees read-only tools", async () => {
  const b = await connect(B), r = await connect(R);
  const bn = (await b.listTools()).tools.map((t) => t.name);
  const rn = (await r.listTools()).tools.map((t) => t.name);
  assert.ok(bn.includes("write_file") && bn.includes("delete_file"));
  assert.ok(!rn.includes("write_file") && !rn.includes("delete_file") && !rn.includes("git_commit"));
  assert.ok(rn.includes("read_handoff") && rn.includes("log_entry"));
  await b.close(); await r.close();
});

test("errors come back as isError text, not a crash", async () => {
  const b = await connect(B);
  const res = await b.callTool({ name: "read_file", arguments: { path: "../../etc/passwd" } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /escapes workspace/);
  const res2 = await b.callTool({ name: "read_file", arguments: { path: "nope.txt" } });
  assert.equal(res2.content[0].text, "ERROR: Not found");
  await b.close();
});

test("every call is logged", () => {
  const lines = fs.readFileSync(path.join(dir, "logs", "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(lines.some((l) => l.event === "auth_denied"));
  assert.ok(lines.some((l) => l.tool === "read_file" && l.ok === false));
});
