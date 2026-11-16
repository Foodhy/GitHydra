import assert from "node:assert/strict";
import { TERMINAL_DOCK_KEY } from "../terminal/dock.ts";
import {
  deletePreset,
  type LayoutStorage,
  loadProjectTree,
  PRESET_KEY,
  projectLayoutKey,
  readPresets,
  readProjectTree,
  savePreset,
  writeProjectTree,
} from "./layout-presets.ts";
import { defaultLayout, findPane, place } from "./layout-tree.ts";
import { VIEW_DOCK_KEY } from "./view-dock.ts";

const memory = new Map<string, string>();
const storage: LayoutStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

const home = defaultLayout();
assert.deepEqual(readPresets(storage), []);
assert.deepEqual(savePreset(storage, "   ", home, "blank"), []);
const saved = savePreset(storage, "  Trabajo ", home, "id1");
assert.equal(saved.length, 1);
assert.equal(saved[0]?.name, "Trabajo");
assert.deepEqual(saved[0]?.tree, home);

writeProjectTree(storage, "/repo/a", home);
let serial = 0;
const moved = place(home, "browser", "center", "right", () => {
  serial += 1;
  return `moved-${serial}`;
});
writeProjectTree(storage, "/repo/b", moved);
assert.equal(deletePreset(storage, "id1").length, 0);
assert.equal(memory.get(PRESET_KEY)?.includes("Trabajo"), false);
assert.deepEqual(readProjectTree(storage, "/repo/a"), home);
assert.deepEqual(
  findPane(readProjectTree(storage, "/repo/b") ?? home, "browser")?.tabs,
  ["browser"],
);

memory.set(TERMINAL_DOCK_KEY, "bottom");
memory.set(VIEW_DOCK_KEY, "editor:bottom");
const migrated = loadProjectTree(storage, "/repo/new");
assert.deepEqual(findPane(migrated, "editor")?.tabs, ["editor"]);
assert.equal(findPane(migrated, "history")?.tabs.includes("editor"), false);
writeProjectTree(storage, "/repo/new", home);
assert.deepEqual(loadProjectTree(storage, "/repo/new"), home);
assert.equal(projectLayoutKey("/repo/a").startsWith("githydra.layout:"), true);
