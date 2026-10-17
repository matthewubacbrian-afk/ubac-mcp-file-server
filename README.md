# MCP File Server

A small MCP connector that gives AI agents a **sandboxed workspace** (read, edit, search, git) over HTTPS,
and a **handoff protocol** so a new agent session can resume from files alone.

## Tools (11)

| Tool | Purpose | Roles |
|---|---|---|
| `list_files` | List one folder | builder, reviewer |
| `read_file` | Read a file, 200 lines at a time (tells you the next `start_line`) | builder, reviewer |
| `search` | Find text across the workspace (`file:line: text`) | builder, reviewer |
| `write_file` | Create or overwrite a file | builder |
| `str_replace` | Replace one unique piece of text | builder |
| `delete_file` | Delete one file. Needs `confirm=true`. Logged | builder |
| `git_status`, `git_log` | See changes and history | builder, reviewer |
| `git_commit` | Stage all and commit | builder |
| `read_handoff` | START OF SESSION: `PROJECT_STATE` + latest PLAN_LOG, CHECKPOINTS, DECISIONS in one call | builder, reviewer |
| `log_entry` | Append the next numbered entry to PLAN_LOG, CHECKPOINTS or DECISIONS | builder, reviewer |

Roles live in `config/roles.json`. Each role has its own token. A role cannot even see tools it does not have.

## Folder layout

```
mcp-file-server/            <- this repo
  src/                      server code (index, server, sandbox, logger, tools/)
  config/roles.json         which role gets which tools
  workspace-template/       copied to workspace/ on first start
  test/                     26 tests (sandbox, tools, HTTP auth and roles)
  scripts/demo.js           makes the evidence/ transcript
  evidence/                 transcript, call log, handoff files, git log
  ecosystem.config.cjs      pm2: server + ngrok tunnel
  .env.example              settings and secrets template
  REPORT.md

workspace/                  <- what the agents see (created on first start, not in the repo)
  projects/
    todo-demo/
      PROJECT_STATE.md      current truth (one file, overwritten)
      PLAN_LOG/             0001.md, 0002.md ...  what was planned and done
      CHECKPOINTS/          0001.md, 0002.md ...  end-of-session summary, where to resume
      DECISIONS/            0001.md, 0002.md ...  choices and why
      src/                  the project's own files
  data/
  TICKETS/
```

PLAN_LOG, CHECKPOINTS and DECISIONS are **append-only**: entries are only created by `log_entry`; `write_file`, `str_replace` and `delete_file` are refused there. Every call and every denied login is written to `logs/calls.jsonl`.

## Setup

You need Node 20.6+, git, a free [ngrok](https://ngrok.com) account, and `npm install -g pm2`.

1. Install and test:
   ```bash
   npm install
   npm test            # 26 tests should pass
   ```
2. Create your settings:
   ```bash
   cp .env.example .env
   openssl rand -hex 24     # run twice; paste into MCP_TOKEN and MCP_TOKEN_REVIEWER
   ```
   Also set `NGROK_DOMAIN` to your free static domain (ngrok dashboard, Domains).
3. Connect ngrok once: `ngrok config add-authtoken <your-ngrok-token>`
4. Start everything and keep it alive:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save && pm2 startup      # restart after reboot (follow the command it prints)
   ```
5. Check it:
   ```bash
   pm2 status                                  # mcp-server and mcp-tunnel: online
   curl https://<NGROK_DOMAIN>/health          # {"ok":true}
   ```
   The first start creates `workspace/` from `workspace-template/`.

Local only, without ngrok: `npm start`, then use `http://localhost:3000/mcp`.

## Connect a client

Endpoint: `https://<NGROK_DOMAIN>/mcp`

- **MCP Inspector**: `npx @modelcontextprotocol/inspector`. Transport: Streamable HTTP. URL as above. Header `Authorization: Bearer <MCP_TOKEN>`.
- **Claude**: Settings > Connectors > Add custom connector. Name it `MCP FILE SERVER`, URL `https://<NGROK_DOMAIN>/mcp?token=<MCP_TOKEN>`.

## Using it with agents

Tell each agent: *"Start with `read_handoff` for project `<name>`. Plan with `log_entry` (PLAN_LOG) before acting. Use `search` and `read_file` chunks, not whole files. At the end: `log_entry` CHECKPOINTS (done, not done, resume at), `log_entry` DECISIONS if you chose something, update `PROJECT_STATE.md`, then `git_commit`."*

Start a new project: `write_file` its `PROJECT_STATE.md` under `projects/<name>/`, then `log_entry` (the folders are created automatically).

## Evidence

`npm run demo` runs a scripted 3-session task (todo module) against the real server and rewrites `evidence/`:
`TRANSCRIPT.md`, `calls.jsonl`, `git-log.txt` and `workspace-snapshot/` (the PLAN_LOG, CHECKPOINTS, DECISIONS files).

**Replace the transcript with a real client run:** in Claude (connector above), run the same task in two separate chats, export or paste both chats into `evidence/TRANSCRIPT.md`, and copy `logs/calls.jsonl` and the `workspace/projects/<name>` folder into `evidence/`.

## Security notes

Short version here; details in `REPORT.md`. Paths are resolved against the workspace root and escapes (`../`, absolute, symlink) are rejected. The endpoint needs a token. Secrets live only in `.env`. Never commit `.env`; rotate tokens if they leak (the `?token=` form can appear in logs).
