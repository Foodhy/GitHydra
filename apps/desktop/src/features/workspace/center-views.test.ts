import assert from "node:assert/strict";
import {
  closeCenterView,
  initialCenterLayout,
  openCenterView,
} from "./center-views.ts";

const start = initialCenterLayout();
assert.equal(start.active, "history");
assert.equal(start.open.browser, true);

const editor = openCenterView(start, "editor");
assert.equal(editor.active, "editor");
assert.equal(editor.open.history, true);

const closedBrowser = closeCenterView(editor, "browser");
assert.equal(closedBrowser.open.browser, false);
assert.equal(closedBrowser.active, "editor");

const closedActive = closeCenterView(closedBrowser, "editor");
assert.equal(closedActive.open.editor, false);
assert.equal(closedActive.active, "history");

const none = closeCenterView(closedActive, "history");
assert.equal(none.open.history, false);
assert.equal(none.open.editor, false);
assert.equal(none.open.browser, false);
assert.equal(none.active, "history");

const again = openCenterView(none, "browser");
assert.equal(again.active, "browser");
assert.equal(again.open.browser, true);
assert.equal(again.open.history, false);

assert.equal(closeCenterView(again, "history"), again);
