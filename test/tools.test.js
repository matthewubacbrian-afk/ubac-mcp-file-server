import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSandbox } from "../src/sandbox.js";
import { ALL_TOOLS } from "../src/tools/index.js";
import { fileURLToPath } from "node:url";

const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tools-")), "ws");
const sandbox = makeSandbox(root);
const ctx = { sandbox, role: "builder" };
fs.cpSync(   fileURLToPath(new URL("../workspace-template", import.meta.url)), root, { recursive: true });
const run = (name, args) => ALL_TOOLS.find((t) => t.name === name).run(args, ctx);

test("has at least 8 tools", () => assert.ok(ALL_TOOLS.length >= 8));

test("write, read, str_replace", () => {
  run("write_file", { path: "projects/todo-demo/a.txt", content: "one\ntwo\ntwo\n" });
  assert.match(run("read_file", { path: "projects/todo-demo/a.txt", start_line: 1, max_lines: 200 }), /lines 1-3 of 3/);
  assert.throws(() => run("str_replace", { path: "projects/todo-demo/a.txt", old_str: "two", new_str: "x" }), /2 times/);
  assert.throws(() => run("str_replace", { path: "projects/todo-demo/a.txt", old_str: "nope", new_str: "x" }), /not found/);
  run("str_replace", { path: "projects/todo-demo/a.txt", old_str: "one", new_str: "1" });
  assert.match(run("read_file", { path: "projects/todo-demo/a.txt", start_line: 1, max_lines: 200 }), /^\[.*\]\n1\ntwo/s);
});

test("read_file reports the next chunk", () => {
  run("write_file", { path: "big.txt", content: Array.from({ length: 450 }, (_, i) => `l${i}`).join("\n") });
  assert.match(run("read_file", { path: "big.txt", start_line: 1, max_lines: 200 }), /More: call again with start_line=201/);
});

test("search finds a line", () => assert.match(run("search", { query: "TWO", path: "projects", limit: 5 }), /a\.txt:2: two/));

test("log folders are append-only", () => {
  assert.throws(() => run("write_file", { path: "projects/todo-demo/PLAN_LOG/0001.md", content: "x" }), /append-only/);
  assert.throws(() => run("delete_file", { path: "projects/todo-demo/CHECKPOINTS/0001.md", confirm: true }), /append-only/);
  assert.throws(() => run("str_replace", { path: "projects/todo-demo/DECISIONS/0001.md", old_str: "a", new_str: "b" }), /append-only/);
});

test("log_entry numbers entries and read_handoff returns the latest", () => {
  assert.match(run("log_entry", { project: "todo-demo", kind: "PLAN_LOG", text: "step A" }), /PLAN_LOG\/0002\.md/);
  assert.match(run("log_entry", { project: "todo-demo", kind: "PLAN_LOG", text: "step B" }), /0003\.md/);
  const h = run("read_handoff", { project: "todo-demo", last: 1 });
  assert.match(h, /step B/);
  assert.doesNotMatch(h, /step A/);
  assert.match(h, /PROJECT_STATE/);
});

test("project names cannot traverse", () => {
  assert.throws(() => run("read_handoff", { project: "../x", last: 1 }));
});

test("PROJECT_STATE.md and .git cannot be deleted or read", () => {
  assert.throws(() => run("delete_file", { path: "projects/todo-demo/PROJECT_STATE.md", confirm: true }), /protected/);
  assert.throws(() => run("read_file", { path: ".git/config" }), /\.git/);
});

test("delete needs confirm=true", () => {
  assert.throws(() => run("delete_file", { path: "big.txt", confirm: false }), /confirm=true/);
});

test("delete works on a normal file", () => {
  assert.match(run("delete_file", { path: "big.txt", confirm: true }), /Deleted big\.txt/);
});

test("git commit and log", () => {
  assert.match(run("git_commit", { message: "test commit" }), /Committed/);
  assert.match(run("git_log", { limit: 3 }), /test commit/);
  assert.match(run("git_status", {}), /Clean/);
});
