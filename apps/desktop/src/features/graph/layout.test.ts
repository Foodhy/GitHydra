import assert from "node:assert/strict";
import { layoutCommits } from "./layout.ts";

const linear = layoutCommits([
  { sha: "c", parentShas: ["b"] },
  { sha: "b", parentShas: ["a"] },
  { sha: "a", parentShas: [] },
]);
assert.deepEqual(
  linear.nodes.map((node) => node.column),
  [0, 0, 0],
);
assert.deepEqual(linear.nodes[0]?.links, [{ toColumn: 0, toRow: 1 }]);
assert.deepEqual(linear.nodes[2]?.links, []);

const branch = layoutCommits([
  { sha: "c", parentShas: ["b"] },
  { sha: "d", parentShas: ["b"] },
  { sha: "b", parentShas: ["a"] },
  { sha: "a", parentShas: [] },
]);
assert.deepEqual(
  branch.nodes.map((node) => [node.sha, node.column]),
  [
    ["c", 0],
    ["d", 1],
    ["b", 0],
    ["a", 0],
  ],
);
assert.deepEqual(branch.nodes[1]?.links, [{ toColumn: 0, toRow: 2 }]);

const truncated = layoutCommits([{ sha: "c", parentShas: ["missing"] }]);
assert.deepEqual(truncated.nodes[0]?.links, []);
