import assert from "node:assert/strict";
import { TERMINAL_DOCK_KEY } from "../terminal/dock.ts";
import { PRESET_KEY, projectLayoutKey } from "./layout-presets.ts";
import {
  type LayoutStorage,
  PANEL_LAYOUT_PREFIX,
  resetWorkspaceLayout,
} from "./layout-reset.ts";
import { VIEW_DOCK_KEY } from "./view-dock.ts";

const memory = new Map<string, string>([
  [TERMINAL_DOCK_KEY, "left"],
  [VIEW_DOCK_KEY, "browser:right"],
  [projectLayoutKey("/repo/a"), "{}"],
  [PRESET_KEY, "[]"],
  [`${PANEL_LAYOUT_PREFIX}cols-v3`, "{}"],
  [`${PANEL_LAYOUT_PREFIX}view-right`, "{}"],
  ["react-resizable-panels:other", "keep"],
  ["githydra.appearance", "keep"],
]);

const storage: LayoutStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
  keys: () => [...memory.keys()],
};

resetWorkspaceLayout(storage);

assert.equal(memory.has(TERMINAL_DOCK_KEY), false);
assert.equal(memory.has(VIEW_DOCK_KEY), false);
assert.equal(memory.has(projectLayoutKey("/repo/a")), false);
assert.equal(memory.get(PRESET_KEY), "[]");
assert.equal(memory.has(`${PANEL_LAYOUT_PREFIX}cols-v3`), false);
assert.equal(memory.has(`${PANEL_LAYOUT_PREFIX}view-right`), false);
assert.equal(memory.get("react-resizable-panels:other"), "keep");
assert.equal(memory.get("githydra.appearance"), "keep");
