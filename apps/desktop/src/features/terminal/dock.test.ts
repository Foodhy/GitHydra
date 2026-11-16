import assert from "node:assert/strict";
import {
  type DockStorage,
  parseTerminalDock,
  readTerminalDock,
  TERMINAL_DOCK_KEY,
  writeTerminalDock,
} from "./dock.ts";

assert.equal(parseTerminalDock(null), "bottom");
assert.equal(parseTerminalDock(undefined), "bottom");
assert.equal(parseTerminalDock("floating"), "bottom");
assert.equal(parseTerminalDock(""), "bottom");
assert.equal(parseTerminalDock("left"), "left");
assert.equal(parseTerminalDock("center"), "center");

const memory = new Map<string, string>();
const storage: DockStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

assert.equal(readTerminalDock(storage), "bottom");
writeTerminalDock(storage, "center");
assert.equal(memory.get(TERMINAL_DOCK_KEY), "center");
assert.equal(readTerminalDock(storage), "center");

memory.set(TERMINAL_DOCK_KEY, "al lado");
assert.equal(readTerminalDock(storage), "bottom");
