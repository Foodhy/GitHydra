import assert from "node:assert/strict";
import {
  centerOpen,
  closePanel,
  defaultLayout,
  findPane,
  migrateLayout,
  openPanel,
  parseLayout,
  place,
  placementOf,
  setRatio,
  zoneAt,
  zoneRect,
} from "./layout-tree.ts";

function ids(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `id${count}`;
  };
}

const home = defaultLayout();
assert.deepEqual(findPane(home, "history")?.tabs, [
  "history",
  "editor",
  "browser",
]);
assert.deepEqual(findPane(home, "terminal")?.tabs, ["terminal"]);
assert.equal(placementOf(home, "terminal")?.side, "second");
assert.equal(placementOf(home, "terminal")?.axis, "y");

const editorDown = place(home, "editor", "center", "bottom", ids());
assert.deepEqual(findPane(editorDown, "editor")?.tabs, ["editor"]);
assert.deepEqual(findPane(editorDown, "history")?.tabs, ["history", "browser"]);
assert.equal(findPane(editorDown, "history")?.id, "center");
assert.equal(placementOf(editorDown, "editor")?.axis, "y");
assert.equal(placementOf(editorDown, "editor")?.side, "second");

const browserRight = place(editorDown, "browser", "center", "right", ids());
assert.deepEqual(findPane(browserRight, "editor")?.tabs, ["editor"]);
assert.deepEqual(findPane(browserRight, "history")?.tabs, ["history"]);
assert.deepEqual(findPane(browserRight, "browser")?.tabs, ["browser"]);
assert.equal(placementOf(browserRight, "editor")?.side, "second");
assert.equal(placementOf(browserRight, "editor")?.axis, "y");

const aboveChanges = place(home, "editor", "changes", "top", ids());
assert.deepEqual(findPane(aboveChanges, "changes")?.tabs, ["changes"]);
assert.deepEqual(findPane(aboveChanges, "editor")?.tabs, ["editor"]);
assert.equal(findPane(aboveChanges, "history")?.tabs.includes("editor"), false);
assert.equal(placementOf(aboveChanges, "editor")?.axis, "y");
assert.equal(placementOf(aboveChanges, "editor")?.side, "first");

const joined = place(home, "terminal", "center", "center");
assert.deepEqual(findPane(joined, "terminal")?.tabs, [
  "history",
  "editor",
  "browser",
  "terminal",
]);
assert.deepEqual(findPane(joined, "changes")?.tabs, ["changes"]);
assert.equal(findPane(joined, "branches")?.tabs.includes("terminal"), false);

assert.equal(place(home, "history", "center", "center"), home);

const editorPane = findPane(editorDown, "editor");
assert.ok(editorPane);
assert.equal(place(editorDown, "editor", editorPane.id, "bottom"), editorDown);
const editorAside = place(editorDown, "editor", editorPane.id, "right");
assert.equal(placementOf(editorAside, "editor")?.axis, "x");
assert.equal(placementOf(editorAside, "editor")?.side, "second");
assert.deepEqual(findPane(editorAside, "history")?.tabs, [
  "history",
  "browser",
]);

const closed = closePanel(closePanel(home, "browser"), "editor");
assert.equal(centerOpen(closed).browser, false);
assert.equal(centerOpen(closed).editor, false);
assert.equal(findPane(closed, "terminal")?.tabs[0], "terminal");
assert.equal(closePanel(closed, "terminal"), closed);
const reopened = openPanel(closed, "browser");
assert.equal(findPane(reopened, "browser")?.active, "browser");
assert.equal(findPane(reopened, "history")?.tabs.includes("browser"), true);

const migrated = migrateLayout("bottom", { view: "editor", side: "bottom" });
assert.deepEqual(findPane(migrated, "editor")?.tabs, ["editor"]);
assert.equal(findPane(migrated, "history")?.tabs.includes("editor"), false);
assert.equal(findPane(migrated, "history")?.tabs.includes("browser"), true);
assert.equal(placementOf(migrated, "editor")?.axis, "y");
assert.equal(placementOf(migrated, "editor")?.side, "second");
assert.equal(placementOf(migrated, "terminal")?.side, "second");

const onRight = migrateLayout("right", { view: "browser", side: "right" });
assert.deepEqual(findPane(onRight, "browser")?.tabs, ["browser"]);
assert.equal(placementOf(onRight, "browser")?.axis, "x");
assert.equal(placementOf(onRight, "browser")?.side, "second");
assert.equal(findPane(onRight, "history")?.tabs.includes("editor"), true);

assert.deepEqual(parseLayout(JSON.stringify(home)), home);
assert.equal(parseLayout(""), null);
assert.equal(parseLayout("{"), null);
assert.equal(
  parseLayout(
    JSON.stringify({
      kind: "pane",
      id: "only",
      tabs: ["editor", "editor"],
      active: "editor",
    }),
  ),
  null,
);

const resized = setRatio(home, "root", 0.5);
assert.equal(resized.kind === "split" && resized.ratio, 0.5);
assert.equal(setRatio(resized, "root", 0.5), resized);

const area = { left: 0, top: 0, width: 100, height: 100 };
assert.equal(zoneAt(area, 50, 50), "center");
assert.equal(zoneAt(area, 5, 50), "left");
assert.equal(zoneAt(area, 96, 40), "right");
assert.equal(zoneAt(area, 50, 4), "top");
assert.equal(zoneAt(area, 50, 96), "bottom");
assert.equal(zoneRect(area, "bottom").top, 50);
assert.equal(zoneRect(area, "right").left, 50);
