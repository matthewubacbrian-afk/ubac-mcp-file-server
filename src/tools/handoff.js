import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { LOG_DIRS } from "./files.js";

const project = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/, "Use letters, numbers, - and _").describe("Project folder name under projects/");
const entries = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}\.md$/.test(f)).sort() : []);

export const tools = [
  {
    name: "read_handoff",
    description: "START OF EVERY SESSION. Returns PROJECT_STATE.md plus the latest entry of PLAN_LOG, CHECKPOINTS and DECISIONS for one project, in a single call.",
    schema: { project, last: z.number().int().min(1).max(5).default(1).describe("How many latest entries per folder") },
    run({ project: name, last }, { sandbox }) {
      const dir = sandbox.safe(`projects/${name}`);
      if (!fs.existsSync(dir)) {
        const root = sandbox.safe("projects");
        const known = fs.existsSync(root) ? fs.readdirSync(root).join(", ") : "";
        throw new Error(`No project '${name}'. Existing projects: ${known || "none"}.`);
      }
      const stateFile = path.join(dir, "PROJECT_STATE.md");
      const out = [`===== PROJECT_STATE.md =====\n${fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : "(missing)"}`];
      for (const kind of LOG_DIRS) {
        const files = entries(path.join(dir, kind));
        if (!files.length) { out.push(`===== ${kind}: no entries yet =====`); continue; }
        for (const f of files.slice(-last)) {
          out.push(`===== ${kind}/${f} (${files.length} total) =====\n${fs.readFileSync(path.join(dir, kind, f), "utf8")}`);
        }
      }
      return out.join("\n\n");
    },
  },
  {
    name: "log_entry",
    description: "Append the next numbered entry (0001.md, 0002.md ...) to PLAN_LOG, CHECKPOINTS or DECISIONS of a project. Entries are stamped with time and agent role and cannot be edited later.",
    schema: {
      project,
      kind: z.enum(LOG_DIRS),
      text: z.string().min(1).max(20_000).describe("Markdown. Keep it short and specific."),
    },
    run({ project: name, kind, text }, { sandbox, role }) {
      const dir = sandbox.safe(`projects/${name}/${kind}`);
      fs.mkdirSync(dir, { recursive: true });
      for (let attempt = 0; attempt < 5; attempt++) {
        const next = String(Math.max(0, ...entries(dir).map((f) => parseInt(f, 10))) + 1).padStart(4, "0");
        const file = path.join(dir, `${next}.md`);
        try {
          fs.writeFileSync(file, `# ${kind} ${next}\n_${new Date().toISOString()} | role: ${role}_\n\n${text}\n`, { flag: "wx" });
          return `Logged ${sandbox.rel(file)}`;
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
        }
      }
      throw new Error("Could not allocate an entry number. Try again.");
    },
  },
];
