import fs from "node:fs";
import path from "node:path";

export function makeSandbox(rootDir) {
  fs.mkdirSync(rootDir, { recursive: true });
  const root = fs.realpathSync(rootDir);
  const inside = (p) => p === root || p.startsWith(root + path.sep);

  function safe(userPath = ".") {
    if (typeof userPath !== "string" || userPath.includes("\0")) throw new Error("Invalid path");
    const abs = path.resolve(root, userPath);
    if (!inside(abs)) throw new Error(`Path escapes workspace: ${userPath}`);
    let cur = abs;
    while (!fs.existsSync(cur)) cur = path.dirname(cur);
    if (!inside(fs.realpathSync(cur))) throw new Error(`Path escapes workspace via symlink: ${userPath}`);
    return abs;
  }

  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/") || ".";

  return { root, safe, rel };
}
