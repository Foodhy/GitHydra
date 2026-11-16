import assert from "node:assert/strict";
import { includePane, mosaicGrid, pageForPane } from "./split.ts";

const pages = [{ id: "1" }, { id: "2" }, { id: "3" }];

assert.equal(pageForPane(["1"], pages, "2"), "2");
assert.equal(pageForPane(["1"], pages, "1"), "2");
assert.equal(pageForPane(["1", "2"], pages, "2"), "3");
assert.equal(pageForPane(["1", "2", "3"], pages, "1"), null);
assert.deepEqual(includePane(["1"], "2"), ["1", "2"]);
assert.deepEqual(includePane(["1", "2"], "2"), ["1", "2"]);
assert.deepEqual(mosaicGrid(2, "side"), {
  columns: "minmax(0, 1fr) minmax(0, 1fr)",
  rows: "minmax(0, 1fr)",
});
assert.deepEqual(mosaicGrid(2, "stack"), {
  columns: "minmax(0, 1fr)",
  rows: "minmax(0, 1fr) minmax(0, 1fr)",
});
assert.equal(mosaicGrid(3, "side").rows, "minmax(0, 1fr) minmax(0, 1fr)");
assert.equal(
  mosaicGrid(5, "stack").rows,
  "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
);
