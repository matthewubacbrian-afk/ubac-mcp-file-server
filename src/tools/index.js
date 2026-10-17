import { tools as fileTools } from "./files.js";
import { tools as gitTools } from "./git.js";
import { tools as handoffTools } from "./handoff.js";
import { brief } from "../logger.js";
import { z } from "zod";

export const ALL_TOOLS = [...fileTools, ...gitTools, ...handoffTools];

function friendly(e, ctx) {
  if (e.code === "ENOENT") return "Not found";
  if (e.code === "EISDIR") return "That path is a folder";
  if (e.code === "ENOTDIR") return "A part of that path is not a folder";
  const msg = String(e.message || e).split("\n")[0];
  return msg.split(ctx.sandbox.root).join("<workspace>");
}

export function registerTools(server, ctx) {
  const allowed = ctx.config.roles[ctx.role].tools;
  for (const t of ALL_TOOLS) {
    if (allowed !== "*" && !allowed.includes(t.name)) continue;
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: z.strictObject(t.schema) },
      async (args) => {
        const started = Date.now();
        try {
          const text = await t.run(args, ctx);
          ctx.logger.log({ role: ctx.role, tool: t.name, args: brief(args), ok: true, ms: Date.now() - started });
          return { content: [{ type: "text", text }] };
        } catch (e) {
          const text = friendly(e, ctx);
          ctx.logger.log({ role: ctx.role, tool: t.name, args: brief(args), ok: false, error: text, ms: Date.now() - started });
          return { content: [{ type: "text", text: `ERROR: ${text}` }], isError: true };
        }
      }
    );
  }
}
