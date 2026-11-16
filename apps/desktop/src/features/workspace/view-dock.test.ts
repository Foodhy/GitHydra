import assert from "node:assert/strict";
import { initialCenterLayout, openCenterView } from "./center-views.ts";
import {
  centerTab,
  type DockStorage,
  movePlaced,
  parsePlacedView,
  placeView,
  readPlacedView,
  releasePlaced,
  VIEW_DOCK_KEY,
  writePlacedView,
} from "./view-dock.ts";

assert.equal(parsePlacedView(null), null);
assert.equal(parsePlacedView(""), null);
assert.equal(parsePlacedView("editor:center"), null);
assert.deepEqual(parsePlacedView("editor:right"), {
  view: "editor",
  side: "right",
});

const memory = new Map<string, string>();
const storage: DockStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

assert.equal(readPlacedView(storage), null);
const placed = placeView("editor", "right");
writePlacedView(storage, placed);
assert.equal(memory.get(VIEW_DOCK_KEY), "editor:right");
assert.deepEqual(readPlacedView(storage), placed);
writePlacedView(storage, null);
assert.equal(readPlacedView(storage), null);

const home = initialCenterLayout();
const editorActive = openCenterView(home, "editor");
assert.equal(centerTab(editorActive, placed), "history");
assert.equal(centerTab(home, placed), "history");

const moved = movePlaced(placed, "bottom");
assert.deepEqual(moved, { view: "editor", side: "bottom" });
assert.equal(centerTab(editorActive, moved), "history");

assert.equal(releasePlaced(moved), null);
assert.equal(centerTab(editorActive, null), "editor");
assert.equal(releasePlaced(moved, "browser"), moved);

const onlyBrowser = {
  open: { history: false, editor: false, browser: true },
  active: "editor" as const,
};
assert.equal(centerTab(onlyBrowser, placed), "browser");
assert.equal(centerTab(onlyBrowser, placeView("browser", "left")), null);
