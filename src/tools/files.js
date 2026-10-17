import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const LOG_DIRS = ["PLAN_LOG", "CHECKPOINTS", "DECISIONS"];

const MAX_FILE = 1_000_000;
const MAX_OUT = 20_000;

const segs = (rel) => rel.split("/");

function checkRead(rel) {
  if (segs(rel).includes(".git")) throw new Error("Access to .git is not allowed");
}
function checkWrite(rel) {
  checkRead(rel);
  if (segs(rel).some((s) => LOG_DIRS.includes(s))) {
    throw new Error(`${rel} is in an append-only log folder. Use log_entry to add an entry.`);
  }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

export const tools = [
  {
    name: "list_files",
    description: "List the files and folders in one workspace folder (not recursive). Folders end with '/'. Paths are relative to the workspace root, e.g. 'projects/todo-demo'.",
    schema: { path: z.string().default(".").describe("Folder to list") },
    run({ path: p }, { sandbox }) {
      const abs = sandbox.safe(p);
      checkRead(sandbox.rel(abs));
      const names = fs.readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.name !== ".git")
        .map((e) => e.name + (e.isDirectory() ? "/" : ""));
      return names.length ? names.join("\n") : "(empty)";
    },
  },
  {
    name: "read_file",
    description: "Read a text file, 200 lines at a time. The reply says how to fetch the next chunk. Prefer search first, then read only the lines you need.",
    schema: {
      path: z.string(),
      start_line: z.number().int().min(1).default(1),
      max_lines: z.number().int().min(1).max(500).default(200),
    },
    run({ path: p, start_line, max_lines }, { sandbox }) {
      const abs = sandbox.safe(p);
      checkRead(sandbox.rel(abs));
      const st = fs.statSync(abs);
      if (!st.isFile()) throw new Error("Not a file");
      if (st.size > MAX_FILE) throw new Error("File too large. Use search to find the part you need.");
      const lines = fs.readFileSync(abs, "utf8").split("\n");
      if (lines.at(-1) === "") lines.pop();
      const from = start_line - 1;
      const slice = lines.slice(from, from + max_lines);
      const end = from + slice.length;
      let body = slice.join("\n");
      let cut = "";
      if (body.length > MAX_OUT) { body = body.slice(0, MAX_OUT); cut = " Output cut at 20000 characters."; }
      const more = end < lines.length ? ` More: call again with start_line=${end + 1}.` : "";
      return `[${sandbox.rel(abs)} lines ${slice.length ? from + 1 : 0}-${end} of ${lines.length}]${cut}${more}\n${body}`;
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite one file. Parent folders are created. Not allowed inside PLAN_LOG, CHECKPOINTS or DECISIONS (use log_entry).",
    schema: { path: z.string(), content: z.string() },
    run({ path: p, content }, { sandbox }) {
      const bytes = Buffer.byteLength(content);
      if (bytes > MAX_FILE) throw new Error("Content too large (max 1 MB)");
      const abs = sandbox.safe(p);
      checkWrite(sandbox.rel(abs));
      const existed = fs.existsSync(abs);
      if (existed && fs.statSync(abs).isDirectory()) throw new Error("Path is a folder");
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      return `${existed ? "Overwrote" : "Created"} ${sandbox.rel(abs)} (${bytes} bytes)`;
    },
  },
  {
    name: "str_replace",
    description: "Replace one exact, unique piece of text in a file. Fails if old_str is missing or appears more than once (add more surrounding text to make it unique). Cheaper than rewriting the whole file.",
    schema: { path: z.string(), old_str: z.string().min(1), new_str: z.string() },
    run({ path: p, old_str, new_str }, { sandbox }) {
      const abs = sandbox.safe(p);
      checkWrite(sandbox.rel(abs));
      const text = fs.readFileSync(abs, "utf8");
      const count = text.split(old_str).length - 1;
      if (count === 0) throw new Error("old_str not found. Read the file again before retrying.");
      if (count > 1) throw new Error(`old_str appears ${count} times. Add more surrounding text so it is unique.`);
      fs.writeFileSync(abs, text.replace(old_str, () => new_str));
      return `Replaced 1 occurrence in ${sandbox.rel(abs)}`;
    },
  },
  {
    name: "delete_file",
    description: "DESTRUCTIVE. Delete one file. Requires confirm=true. PROJECT_STATE.md, .git and the log folders are protected. Every call is logged.",
    schema: { path: z.string(), confirm: z.boolean().default(false).describe("Must be true to delete") },
    run({ path: p, confirm }, { sandbox }) {
      if (confirm !== true) throw new Error("Delete not done. Call again with confirm=true if you are sure.");
      const abs = sandbox.safe(p);
      const rel = sandbox.rel(abs);
      checkWrite(rel);
      if (path.basename(abs) === "PROJECT_STATE.md") throw new Error("PROJECT_STATE.md is protected. Overwrite it with write_file instead.");
      if (!fs.statSync(abs).isFile()) throw new Error("Only single files can be deleted");
      fs.unlinkSync(abs);
      return `Deleted ${rel}`;
    },
  },
  {
    name: "search",
    description: "Case-insensitive text search across files in a folder (default: whole workspace). Returns 'file:line: text'. Use this to find the right lines before read_file.",
    schema: {
      query: z.string().min(1),
      path: z.string().default("."),
      limit: z.number().int().min(1).max(100).default(30),
    },
    run({ query, path: p, limit }, { sandbox }) {
      const start = sandbox.safe(p);
      checkRead(sandbox.rel(start));
      const q = query.toLowerCase();
      const hits = [];
      const files = fs.statSync(start).isFile() ? [start] : walk(start);
      for (const f of files) {
        if (hits.length >= limit) break;
        if (fs.statSync(f).size > MAX_FILE) continue;
        fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
          if (hits.length < limit && line.toLowerCase().includes(q)) {
            hits.push(`${sandbox.rel(f)}:${i + 1}: ${line.trim().slice(0, 200)}`);
          }
        });
      }
      return hits.length ? hits.join("\n") : "No matches";
    },
  },
];
