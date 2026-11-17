import assert from "node:assert/strict";
import { moveTarget, retargetOpen, retargetPath } from "./move.ts";

assert.equal(moveTarget("a.txt", { path: "src", kind: "dir" }), "src");
assert.equal(
  moveTarget("src/a.txt", { path: "docs/b.ts", kind: "file" }),
  "docs",
);
assert.equal(moveTarget("a.txt", null), null);
assert.equal(moveTarget("src/a.txt", { path: "src", kind: "dir" }), null);
assert.equal(moveTarget("src", { path: "src/lib", kind: "dir" }), null);
assert.equal(moveTarget("src", { path: "src", kind: "dir" }), null);
assert.equal(moveTarget("src/a.txt", null), "");
assert.equal(moveTarget("", { path: "src", kind: "dir" }), null);

assert.equal(retargetPath("src/a.ts", "src", "lib"), "lib/a.ts");
assert.equal(retargetPath("docs/a.ts", "src", "lib"), "docs/a.ts");
assert.equal(retargetPath("src2/a.ts", "src", "lib"), "src2/a.ts");

const open = retargetOpen(
  { "": true, src: true, "src/lib": true, docs: true },
  "src",
  "lib",
);
assert.equal(open[""], true);
assert.equal(open.lib, true);
assert.equal(open["lib/lib"], true);
assert.equal(open.docs, true);
assert.equal(open.src, undefined);
