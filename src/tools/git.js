import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";

function git(root, ...args) {
  if (!fs.existsSync(path.join(root, ".git"))) {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  }
  return execFileSync(
    "git",
    ["-c", "user.name=mcp-agent", "-c", "user.email=agent@mcp.local", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

export const tools = [
  {
    name: "git_status",
    description: "Show uncommitted changes in the workspace (short format).",
    schema: {},
    run(_args, { sandbox }) {
      return git(sandbox.root, "status", "--short") || "Clean: nothing to commit";
    },
  },
  {
    name: "git_commit",
    description: "Stage all changes and commit them with a message. Use one commit per finished step.",
    schema: { message: z.string().min(1).max(200) },
    run({ message }, { sandbox, role }) {
      git(sandbox.root, "add", "-A");
      if (!git(sandbox.root, "status", "--short")) return "Nothing to commit";
      git(sandbox.root, "commit", "-q", "-m", message, "-m", `Agent role: ${role}`);
      return `Committed: ${git(sandbox.root, "log", "-1", "--format=%h %s")}`;
    },
  },
  {
    name: "git_log",
    description: "Show the most recent commits, one per line.",
    schema: { limit: z.number().int().min(1).max(50).default(10) },
    run({ limit }, { sandbox }) {
      try {
        return git(sandbox.root, "log", `-${limit}`, "--format=%h %ad %s", "--date=short");
      } catch {
        return "No commits yet";
      }
    },
  },
];
