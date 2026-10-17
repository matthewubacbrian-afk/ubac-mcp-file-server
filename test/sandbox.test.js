import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSandbox } from "../src/sandbox.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-"));
const root = path.join(tmp, "workspace");
const { safe } = makeSandbox(root);

test("allows normal paths", () => {
  assert.ok(safe("projects/a/b.txt").endsWith(path.join("workspace", "projects", "a", "b.txt")));
  assert.ok(safe(".").endsWith("workspace"));
});

for (const bad of ["../x", "a/../../x", "/etc/passwd", "..", "a/../../../etc/passwd", "projects/../../outside"]) {
  test(`rejects ${bad}`, () => assert.throws(() => safe(bad), /escapes/));
}

test("rejects sibling folder with the same prefix", () => {
  fs.mkdirSync(root + "-evil", { recursive: true });
  assert.throws(() => safe("../workspace-evil/x"), /escapes/);
});

test("rejects a symlink that points outside", () => {
  fs.symlinkSync(os.tmpdir(), path.join(root, "link"));
  assert.throws(() => safe("link/anything"), /symlink/);
});

test("rejects null byte", () => assert.throws(() => safe("a\0b"), /Invalid/));
