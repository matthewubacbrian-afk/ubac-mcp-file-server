import fs from "node:fs";
import path from "node:path";

export function makeLogger(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "calls.jsonl");
  return {
    file,
    log(record) {
      fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
    },
  };
}

export function brief(args) {
  return Object.fromEntries(
    Object.entries(args || {}).map(([k, v]) =>
      [k, typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}...(${v.length} chars)` : v]
    )
  );
}
