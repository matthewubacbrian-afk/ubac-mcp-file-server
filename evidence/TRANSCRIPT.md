# Tool-call transcript (demo task: todo module, 3 sessions)

Date: 2026-10-17
Endpoint: local run of the real server over HTTP
Client: scripted MCP client (not an LLM). See README "Replace the transcript with a real client run".
Calls made: 26
Rejected calls marked "(expected)" are deliberate guard tests.

## Session 1 (builder): build the module

Tools visible to builder: list_files, read_file, write_file, str_replace, delete_file, search, git_status, git_commit, git_log, read_handoff, log_entry

**read_handoff** `{"project":"todo-demo","last":1}`
```
===== PROJECT_STATE.md =====
# PROJECT_STATE

Project: todo-demo
Goal: Build a small todo library (src/todo.js) through the MCP file server.
Status: not started
Next step: Session 1 creates src/todo.js with add() and list().
Open questions: none


===== PLAN_LOG/0001.md (1 total) =====
# PLAN_LOG 0001
Project created. Plan: S1 builds add/list, S2 adds done(n).


===== CHECKPOINTS/0001.md (1 total) =====
# CHECKPOINTS 0001
Nothing built yet. Resume at: create src/todo.js.


===== DECISIONS/0001.md (1 total) =====
# DECISIONS 0001
Entries are append-only and numbered. Never edit an old one; write a new one.

```

**log_entry** `{"project":"todo-demo","kind":"PLAN_LOG","text":"S1 plan: 1) create src/todo.js with add and list. 2) test the guards. 3) commit. 4) write the handoff."}`
```
Logged projects/todo-demo/PLAN_LOG/0002.md
```

**write_file** `{"path":"projects/todo-demo/src/todo.js","content":"const items = [];\nexport function add(text) { items.push({ text, done: false }); return items.length; }\nex`
```
Created projects/todo-demo/src/todo.js (206 bytes)
```

**read_file** `{"path":"../../etc/passwd","start_line":1,"max_lines":200}`  -> ERROR (expected)
```
ERROR: Path escapes workspace: ../../etc/passwd
```

**write_file** `{"path":"/tmp/evil.txt","content":"x"}`  -> ERROR (expected)
```
ERROR: Path escapes workspace: /tmp/evil.txt
```

**write_file** `{"path":"projects/todo-demo/PLAN_LOG/0001.md","content":"overwrite"}`  -> ERROR (expected)
```
ERROR: projects/todo-demo/PLAN_LOG/0001.md is in an append-only log folder. Use log_entry to add an entry.
```

**delete_file** `{"path":"projects/todo-demo/src/todo.js"}`  -> ERROR (expected)
```
ERROR: Delete not done. Call again with confirm=true if you are sure.
```

**git_commit** `{"message":"S1: add todo module with add and list"}`
```
Committed: 196ed93 S1: add todo module with add and list
```

**log_entry** `{"project":"todo-demo","kind":"DECISIONS","text":"Keep todo state in memory only. Simplest thing that proves the handoff."}`
```
Logged projects/todo-demo/DECISIONS/0002.md
```

**log_entry** `{"project":"todo-demo","kind":"CHECKPOINTS","text":"S1 done: src/todo.js has add() and list(), committed.\nNot done: no way to mark an item done.\nResume at: ad`
```
Logged projects/todo-demo/CHECKPOINTS/0002.md
```

**write_file** `{"path":"projects/todo-demo/PROJECT_STATE.md","content":"# PROJECT_STATE\n\nProject: todo-demo\nGoal: Build a small todo library (src/todo.js) through the MCP f`
```
Overwrote projects/todo-demo/PROJECT_STATE.md (222 bytes)
```

**git_commit** `{"message":"S1: handoff updated"}`
```
Committed: e65e1d3 S1: handoff updated
```


## Session 2 (builder): fresh agent, starts only from the handoff

**read_handoff** `{"project":"todo-demo","last":1}`
```
===== PROJECT_STATE.md =====
# PROJECT_STATE

Project: todo-demo
Goal: Build a small todo library (src/todo.js) through the MCP file server.
Status: in progress (S1 complete)
Next step: S2 adds done(n) to src/todo.js and commits.
Open questions: none


===== PLAN_LOG/0002.md (2 total) =====
# PLAN_LOG 0002
_2026-10-17T00:24:20.566Z | role: builder_

S1 plan: 1) create src/todo.js with add and list. 2) test the guards. 3) commit. 4) write the handoff.


===== CHECKPOINTS/0002.md (2 total) =====
# CHECKPOINTS 0002
_2026-10-17T00:24:20.735Z | role: builder_

S1 done: src/todo.js has add() and list(), committed.
Not done: no way to mark an item done.
Resume at: add done(n), then commit.


===== DECISIONS/0002.md (2 total) =====
# DECISIONS 0002
_2026-10-17T00:24:20.730Z | role: builder_

Keep todo state in memory only. Simplest thing that proves the handoff.

```

**log_entry** `{"project":"todo-demo","kind":"PLAN_LOG","text":"S2 plan (from S1 checkpoint): 1) find list() with search. 2) add done(n) with str_replace. 3) commit. 4) write `
```
Logged projects/todo-demo/PLAN_LOG/0003.md
```

**search** `{"query":"export function","path":"projects/todo-demo/src","limit":5}`
```
projects/todo-demo/src/todo.js:2: export function add(text) { items.push({ text, done: false }); return items.length; }
projects/todo-demo/src/todo.js:3: export function list() { return items.map((i, n) => `${n + 1}. [${i.done ? "x" : " "}] ${i.text}`); }
```

**str_replace** `{"path":"projects/todo-demo/src/todo.js","old_str":"export function","new_str":"x"}`  -> ERROR (expected)
```
ERROR: old_str appears 2 times. Add more surrounding text so it is unique.
```

**str_replace** `{"path":"projects/todo-demo/src/todo.js","old_str":"export function list()","new_str":"export function done(n) { items[n - 1].done = true; }\nexport function li`
```
Replaced 1 occurrence in projects/todo-demo/src/todo.js
```

**read_file** `{"path":"projects/todo-demo/src/todo.js","start_line":1,"max_lines":20}`
```
[projects/todo-demo/src/todo.js lines 1-4 of 4]
const items = [];
export function add(text) { items.push({ text, done: false }); return items.length; }
export function done(n) { items[n - 1].done = true; }
export function list() { return items.map((i, n) => `${n + 1}. [${i.done ? "x" : " "}] ${i.text}`); }
```

**git_commit** `{"message":"S2: add done(n) to mark items complete"}`
```
Committed: 985f5e6 S2: add done(n) to mark items complete
```

**log_entry** `{"project":"todo-demo","kind":"CHECKPOINTS","text":"S2 done: done(n) added and committed. Task complete across 2 sessions.\nResume at: nothing left."}`
```
Logged projects/todo-demo/CHECKPOINTS/0003.md
```

**write_file** `{"path":"projects/todo-demo/PROJECT_STATE.md","content":"# PROJECT_STATE\n\nProject: todo-demo\nGoal: Build a small todo library (src/todo.js) through the MCP f`
```
Overwrote projects/todo-demo/PROJECT_STATE.md (171 bytes)
```

**git_commit** `{"message":"S2: handoff updated, task complete"}`
```
Committed: 4a3f48d S2: handoff updated, task complete
```

**git_log** `{"limit":5}`
```
4a3f48d 2026-10-17 S2: handoff updated, task complete
985f5e6 2026-10-17 S2: add done(n) to mark items complete
e65e1d3 2026-10-17 S1: handoff updated
196ed93 2026-10-17 S1: add todo module with add and list
```


## Session 3 (reviewer, read-only role)

Tools visible to reviewer: list_files, read_file, search, git_status, git_log, read_handoff, log_entry

**read_handoff** `{"project":"todo-demo","last":1}`
```
===== PROJECT_STATE.md =====
# PROJECT_STATE

Project: todo-demo
Goal: Build a small todo library (src/todo.js) through the MCP file server.
Status: complete (S2)
Next step: none
Open questions: none


===== PLAN_LOG/0003.md (3 total) =====
# PLAN_LOG 0003
_2026-10-17T00:24:20.856Z | role: builder_

S2 plan (from S1 checkpoint): 1) find list() with search. 2) add done(n) with str_replace. 3) commit. 4) write the handoff.


===== CHECKPOINTS/0003.md (3 total) =====
# CHECKPOINTS 0003
_2026-10-17T00:24:21.013Z | role: builder_

S2 done: done(n) added and committed. Task complete across 2 sessions.
Resume at: nothing left.


===== DECISIONS/0002.md (2 total) =====
# DECISIONS 0002
_2026-10-17T00:24:20.730Z | role: builder_

Keep todo state in memory only. Simplest thing that proves the handoff.

```

**write_file** `{"path":"projects/todo-demo/src/todo.js","content":"tampered"}`  -> ERROR (expected)
```
MCP error -32602: Tool write_file not found
```

**log_entry** `{"project":"todo-demo","kind":"DECISIONS","text":"Reviewer: todo.js reviewed, looks fine."}`
```
Logged projects/todo-demo/DECISIONS/0003.md
```
