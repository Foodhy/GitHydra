import assert from "node:assert/strict";
import { filterIndexedFiles } from "./index.ts";

const files = ["src/app.ts", "docs/app.md", "README.md"];
assert.deepEqual(filterIndexedFiles(files, "app"), [
  "src/app.ts",
  "docs/app.md",
]);
assert.deepEqual(filterIndexedFiles(files, "  "), []);
assert.equal(
  filterIndexedFiles(
    Array.from({ length: 100 }, (_, i) => `f${i}.ts`),
    "f",
  ).length,
  80,
);
