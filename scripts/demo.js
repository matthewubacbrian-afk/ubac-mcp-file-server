import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 3055;
const BUILDER = process.env.MCP_TOKEN || "demo-builder-token-123456";
const REVIEWER = process.env.MCP_TOKEN_REVIEWER || "demo-reviewer-token-123456";
const URL_ = process.env.MCP_URL || `http://localhost:${PORT}/mcp`;
const external = Boolean(process.env.MCP_URL);
const RUN = path.resolve(".demo-run");
const P = "projects/todo-demo";
const out = [];
let calls = 0;

let server;
if (!external) {
  fs.rmSync(RUN, { recursive: true, force: true });
  server = spawn("node", ["src/index.js"], {
    env: { ...process.env, PORT, MCP_TOKEN: BUILDER, MCP_TOKEN_REVIEWER: REVIEWER,
           WORKSPACE_ROOT: path.join(RUN, "workspace"), LOG_DIR: path.join(RUN, "logs") },
    stdio: "inherit",
  });
  await new Promise((r) => setTimeout(r, 1200));
}

async function session(title, token, steps) {
  const client = new Client({ name: "demo", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  out.push(`\n## ${title}\n`);
  const call = async (tool, args = {}) => {
    calls++;
    let text, bad = false;
    try {
      const r = await client.callTool({ name: tool, arguments: args });
      text = r.content.map((c) => c.text).join("\n"); bad = Boolean(r.isError);
    } catch (e) { text = e.message; bad = true; }
    out.push(`**${tool}** \`${JSON.stringify(args).slice(0, 160)}\`${bad ? "  -> ERROR (expected)" : ""}\n\`\`\`\n${text}\n\`\`\`\n`);
    return text;
  };
  await steps(call, client);
  await client.close();
}

await session("Session 1 (builder): build the module", BUILDER, async (call, client) => {
  out.push(`Tools visible to builder: ${(await client.listTools()).tools.map((t) => t.name).join(", ")}\n`);
  await call("read_handoff", { project: "todo-demo", last: 1 });
  await call("log_entry", { project: "todo-demo", kind: "PLAN_LOG", text: "S1 plan: 1) create src/todo.js with add and list. 2) test the guards. 3) commit. 4) write the handoff." });
  await call("write_file", { path: `${P}/src/todo.js`, content:
`const items = [];
export function add(text) { items.push({ text, done: false }); return items.length; }
export function list() { return items.map((i, n) => \`\${n + 1}. [\${i.done ? "x" : " "}] \${i.text}\`); }
` });
  await call("read_file", { path: "../../etc/passwd", start_line: 1, max_lines: 200 });
  await call("write_file", { path: "/tmp/evil.txt", content: "x" });
  await call("write_file", { path: `${P}/PLAN_LOG/0001.md`, content: "overwrite" });
  await call("delete_file", { path: `${P}/src/todo.js` });
  await call("git_commit", { message: "S1: add todo module with add and list" });
  await call("log_entry", { project: "todo-demo", kind: "DECISIONS", text: "Keep todo state in memory only. Simplest thing that proves the handoff." });
  await call("log_entry", { project: "todo-demo", kind: "CHECKPOINTS", text: "S1 done: src/todo.js has add() and list(), committed.\nNot done: no way to mark an item done.\nResume at: add done(n), then commit." });
  await call("write_file", { path: `${P}/PROJECT_STATE.md`, content:
`# PROJECT_STATE

Project: todo-demo
Goal: Build a small todo library (src/todo.js) through the MCP file server.
Status: in progress (S1 complete)
Next step: S2 adds done(n) to src/todo.js and commits.
Open questions: none
` });
  await call("git_commit", { message: "S1: handoff updated" });
});

await session("Session 2 (builder): fresh agent, starts only from the handoff", BUILDER, async (call, client) => {
  const [handoff] = await Promise.all([client.callTool({ name: "read_handoff", arguments: { project: "todo-demo", last: 1 } }), Promise.resolve()]);
  calls++;
  out.push(`**read_handoff** \`{"project":"todo-demo","last":1}\`\n\`\`\`\n${handoff.content[0].text}\n\`\`\`\n`);
  await call("log_entry", { project: "todo-demo", kind: "PLAN_LOG", text: "S2 plan (from S1 checkpoint): 1) find list() with search. 2) add done(n) with str_replace. 3) commit. 4) write the handoff." });
  await call("search", { query: "export function", path: `${P}/src`, limit: 5 });
  await call("str_replace", { path: `${P}/src/todo.js`, old_str: "export function", new_str: "x" });
  await call("str_replace", { path: `${P}/src/todo.js`, old_str: "export function list()", new_str: "export function done(n) { items[n - 1].done = true; }\nexport function list()" });
  await call("read_file", { path: `${P}/src/todo.js`, start_line: 1, max_lines: 20 });
  await call("git_commit", { message: "S2: add done(n) to mark items complete" });
  await call("log_entry", { project: "todo-demo", kind: "CHECKPOINTS", text: "S2 done: done(n) added and committed. Task complete across 2 sessions.\nResume at: nothing left." });
  await call("write_file", { path: `${P}/PROJECT_STATE.md`, content:
`# PROJECT_STATE

Project: todo-demo
Goal: Build a small todo library (src/todo.js) through the MCP file server.
Status: complete (S2)
Next step: none
Open questions: none
` });
  await call("git_commit", { message: "S2: handoff updated, task complete" });
  await call("git_log", { limit: 5 });
});

await session("Session 3 (reviewer, read-only role)", REVIEWER, async (call, client) => {
  out.push(`Tools visible to reviewer: ${(await client.listTools()).tools.map((t) => t.name).join(", ")}\n`);
  await call("read_handoff", { project: "todo-demo", last: 1 });
  await call("write_file", { path: `${P}/src/todo.js`, content: "tampered" });
  await call("log_entry", { project: "todo-demo", kind: "DECISIONS", text: "Reviewer: todo.js reviewed, looks fine." });
});

fs.mkdirSync("evidence", { recursive: true });
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync("evidence/TRANSCRIPT.md",
`# Tool-call transcript (demo task: todo module, 3 sessions)

Date: ${date}
Endpoint: ${external ? URL_ : "local run of the real server over HTTP"}
Client: scripted MCP client (not an LLM). See README "Replace the transcript with a real client run".
Calls made: ${calls}
Rejected calls marked "(expected)" are deliberate guard tests.
${out.join("\n")}`);

if (!external) {
  const ws = path.join(RUN, "workspace");
  fs.rmSync("evidence/workspace-snapshot", { recursive: true, force: true });
  fs.cpSync(path.join(ws, "projects"), "evidence/workspace-snapshot/projects", { recursive: true });
  fs.copyFileSync(path.join(RUN, "logs", "calls.jsonl"), "evidence/calls.jsonl");
  const { execFileSync } = await import("node:child_process");
  fs.writeFileSync("evidence/git-log.txt", execFileSync("git", ["log", "--format=%h %ad %s", "--date=short"], { cwd: ws, encoding: "utf8" }));
  server.kill();
}
console.log(`Done: ${calls} calls. See evidence/`);
