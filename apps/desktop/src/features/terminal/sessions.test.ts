import assert from "node:assert/strict";
import type { DockStorage } from "./dock.ts";
import {
  addTerminal,
  closeTerminal,
  createTerminal,
  loadTerminals,
  recolorTerminal,
  renameTerminal,
  saveTerminals,
  TERMINAL_KEY,
  TERMINAL_LIMIT,
} from "./sessions.ts";

const memory = new Map<string, string>();
const storage: DockStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

const path = "/repo";
assert.equal(loadTerminals(storage, path)[0]?.name, "Terminal");

const first = createTerminal("a", 0);
const second = createTerminal("b", 1);
const tabs = addTerminal(addTerminal([], first), second);
assert.equal(tabs[1]?.name, "Terminal 2");
assert.equal(tabs[1]?.color, "#7aa2f7");
assert.deepEqual(renameTerminal(tabs, "b", "  api   web  "), [
  first,
  { id: "b", name: "api web", color: "#7aa2f7" },
]);
assert.equal(renameTerminal(tabs, "b", "   ").length, 2);
assert.equal(renameTerminal(tabs, "b", "   ")[1]?.name, "Terminal 2");
assert.equal(recolorTerminal(tabs, "a", "#f7768e")[0]?.color, "#f7768e");
assert.equal(recolorTerminal(tabs, "a", "red")[0]?.color, first.color);
assert.equal(closeTerminal(tabs, "a").length, 1);
assert.equal(closeTerminal(tabs, "a")[0]?.id, "b");

saveTerminals(storage, path, renameTerminal(tabs, "b", "api"));
assert.equal(loadTerminals(storage, path)[1]?.name, "api");
saveTerminals(storage, path, []);
assert.equal(loadTerminals(storage, path).length, 0);
assert.equal(loadTerminals(storage, "/otro")[0]?.name, "Terminal");
memory.set(TERMINAL_KEY, "{");
assert.equal(loadTerminals(storage, path)[0]?.name, "Terminal");

const full = Array.from({ length: TERMINAL_LIMIT + 2 }, (_, index) =>
  createTerminal(String(index + 1), index),
);
assert.equal(
  full.slice(1).reduce(addTerminal, [full[0]]).length,
  TERMINAL_LIMIT,
);
