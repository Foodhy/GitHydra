import assert from "node:assert/strict";
import { buildStatusMarks } from "./status.ts";

const marks = buildStatusMarks([
  { path: "src/app.ts", kind: "modified" },
  { path: "src/new.ts", kind: "untracked" },
  { path: "docs/old.md", kind: "deleted" },
]);

assert.equal(marks.get("src/app.ts")?.label, "M");
assert.equal(marks.get("src/app.ts")?.tone, "changed");
assert.equal(marks.get("src/new.ts")?.label, "U");
assert.equal(marks.get("src/new.ts")?.tone, "new");
assert.equal(marks.get("src")?.label, "·");
assert.equal(marks.get("src")?.tone, "changed");
assert.equal(marks.get("docs")?.label, "·");
assert.equal(marks.get(""), undefined);

const both = buildStatusMarks([
  { path: "a.ts", kind: "added" },
  { path: "a.ts", kind: "conflicted" },
]);
assert.equal(both.get("a.ts")?.label, "C");
