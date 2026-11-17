import assert from "node:assert/strict";
import {
  closeTab,
  initialTabs,
  newTab,
  openPath,
  renamePath,
  reopenClosed,
  showManagement,
  worktreeTabName,
} from "./repo-tabs.ts";

const start = initialTabs();
assert.equal(start.tabs.length, 1);
assert.equal(start.activeId, "inicio");

const added = newTab(start, "b");
assert.deepEqual(
  added.tabs.map((tab) => tab.id),
  ["inicio", "b"],
);
assert.equal(added.activeId, "b");
assert.equal(added.tabs[1]?.path, null);

const filled = openPath(added, "/repo/one", "one", "c");
assert.equal(filled.activeId, "b");
assert.equal(filled.tabs[1]?.path, "/repo/one");
assert.equal(filled.tabs[1]?.name, "one");

const second = openPath(filled, "/repo/two", "two", "d");
assert.equal(second.activeId, "d");
assert.equal(second.tabs.length, 3);

const again = openPath(second, "/repo/one", "one", "e");
assert.equal(again.activeId, "b");
assert.equal(again.tabs.length, 3);

const closed = closeTab(again, "b", "f");
assert.deepEqual(closed.closed, ["/repo/one"]);
assert.equal(
  closed.tabs.some((tab) => tab.id === "b"),
  false,
);
assert.equal(closed.activeId, "d");

const kept = closeTab(second, "inicio", "z");
assert.equal(kept.activeId, "d");
assert.deepEqual(kept.closed, []);

const managed = showManagement(closed);
assert.equal(managed.activeId, null);

const fromHome = openPath(managed, "/repo/three", "three", "g");
assert.equal(fromHome.activeId, "inicio");
assert.equal(fromHome.tabs[0]?.path, "/repo/three");

const reopened = reopenClosed({ ...fromHome, closed: ["/repo/one"] }, "h");
assert.deepEqual(reopened.closed, []);
assert.equal(reopened.activeId, "h");
assert.equal(
  reopened.tabs.find((tab) => tab.path === "/repo/one")?.name,
  "one",
);

const last = closeTab(
  {
    tabs: [{ id: "only", path: "/x", name: "x" }],
    activeId: "only",
    closed: [],
  },
  "only",
  "fresh",
);
assert.equal(last.tabs.length, 1);
assert.equal(last.tabs[0]?.id, "fresh");
assert.equal(last.tabs[0]?.path, null);
assert.deepEqual(last.closed, ["/x"]);

const copies = [
  { path: "/code/app", branch: "main", isDetached: false },
  { path: "/tmp/otra/app", branch: "lado", isDetached: false },
];
assert.equal(worktreeTabName(copies[0], copies), "app · main");
assert.equal(worktreeTabName(copies[1], copies), "app · lado");
assert.equal(
  worktreeTabName({ path: "/tmp/suelto/app", branch: null, isDetached: true }, [
    { path: "/code/app" },
    { path: "/tmp/suelto/app" },
  ]),
  "suelto/app",
);
assert.equal(
  worktreeTabName({ path: "/code/unica", branch: "main", isDetached: false }, [
    { path: "/code/unica" },
  ]),
  "unica",
);
const renamed = renamePath(fromHome, "/repo/three", "three · main");
assert.equal(renamed.tabs[0]?.name, "three · main");
assert.equal(renamePath(renamed, "/repo/three", "three · main"), renamed);
