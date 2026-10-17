# Midterms Pt 1: Report

Project: MCP file-server connector (`mcp-file-server`)

## 1. Stack and why

| Layer | Choice | Why |
|---|---|---|
| Runtime and SDK | Node.js 20 with the official MCP SDK (JavaScript) | Reference choice. The SDK handles the protocol, so the code is only tools and security. |
| Transport | Streamable HTTP, stateless (one MCP server per request) | Works through a tunnel. No session state to lose when the process restarts. |
| Validation | zod schemas on every tool input (`strictObject`, unknown fields rejected) | Bad input never reaches the file system. |
| Exposure | ngrok with a free static domain | Stable HTTPS URL, nothing to open on the router. |
| Process manager | pm2 (`ecosystem.config.cjs`) for the server and the tunnel | Restarts both after a crash. `pm2 save` + `pm2 startup` bring them back after a reboot. |
| Version control | git on the workspace, called with `execFile` (no shell) | Every step can be committed and undone. |
| Testing | Node test runner (26 tests), MCP Inspector, then a real client | Tests cover the sandbox, tools and roles. The Inspector and a real client check the live endpoint. |

Architecture: `src/server.js` (HTTP, auth, roles), `src/sandbox.js` (paths), `src/tools/*` (tools), `src/config.js` + `config/roles.json` (settings). Secrets only in `.env`. The workspace data survives restarts because it is plain files plus git.

## 2. Tool design choices

- **11 small tools, one job each**, with short descriptions that say when to use them (for example "start of every session").
- **Fewer calls for the agent**: `read_handoff` returns state and the latest entries in one call. `git_commit` stages and commits in one call. `str_replace` edits a few lines instead of rewriting a file.
- **Small outputs**: `read_file` returns 200 lines at a time and says which `start_line` is next. `search` returns `file:line: text` so the agent reads only what it needs. Replies are capped at 20,000 characters.
- **Helpful errors**: failures return `isError` with a plain sentence ("old_str appears 2 times. Add more surrounding text so it is unique."). Server paths are replaced by `<workspace>`. No stack traces.
- **Safe stop conditions**: `str_replace` fails on missing or ambiguous text, so an agent cannot loop on a silent wrong edit.

## 3. Agent and tool management

- **Roles with scoped tools** (`config/roles.json`): `builder` has all 11 tools. `reviewer` has 7 read-only tools plus `log_entry`. Each role has its own token, and the reviewer cannot see the write tools at all.
- **Destructive actions are gated**: `delete_file` needs `confirm=true`, refuses `PROJECT_STATE.md`, `.git` and the log folders, and is logged.
- **Handoff files carry context across sessions**: `PROJECT_STATE.md` is the current truth. `PLAN_LOG/`, `CHECKPOINTS/` and `DECISIONS/` are numbered, append-only entries stamped with time and role. Two agents cannot overwrite each other (new entries are created with an exclusive-create flag).
- **Every call is logged** to `logs/calls.jsonl` (time, role, tool, shortened arguments, ok or error, milliseconds), including denied logins.

## 4. Demo task results (see `evidence/`)

Task: build a todo module. Session 1 (builder) planned, wrote `src/todo.js`, tested four guards, committed and wrote the handoff. Session 2 (builder) started only with `read_handoff`, read the "Resume at" line, added `done(n)` and committed. Session 3 (reviewer) read the handoff and was refused when it tried to write.
The run took 26 calls including 8 deliberate guard tests. The plan was logged before acting in both sessions, and each session re-read only the lines it needed.
The transcript in the repo is from a scripted client. The README explains how to replace it with a real client run.

## 5. Security tradeoffs

| Threat | Protection | Remaining risk |
|---|---|---|
| Path traversal (`../`, absolute path) | Every path is resolved against the workspace root and checked. Tests cover six escape forms. | None known |
| Symlink escape | The real path of the nearest existing folder is re-checked. Symlinks are skipped by search. | A symlink created outside the server between check and use (race) |
| Open endpoint | Token required (16+ characters, constant-time compare). The server refuses to start without one. Denied logins are logged. | `?token=` in a URL can show up in logs. Rotate if shared. No rate limiting. |
| Over-powered agents | Role-scoped tools; reviewer is read-only | A builder can still overwrite any normal file |
| Destructive actions | `confirm=true`, protected files, append-only logs, git history for recovery | A builder can overwrite `PROJECT_STATE.md` (by design, git can restore it) |
| Large input | 1 MB limit on files, 2 MB on requests, 20,000 character replies | No total workspace quota |
| Command injection | No shell. Git is called with an argument array. Project names are matched to `[A-Za-z0-9_-]`. | None known |
| Leaking server details | Errors hide server paths | |

## 6. Limitations

- The checked-in transcript is from a scripted client. A real-client run is described in the README.
- Single shared token per role, no per-user accounts, no rate limiting.
