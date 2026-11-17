import assert from "node:assert/strict";
import { applyRuns, commandLine, releaseHeld } from "./run.ts";
import { createTerminal } from "./sessions.ts";

const first = createTerminal("a", 0);
const second = createTerminal("b", 1);
const applied = applyRuns(
  [first, second],
  [
    { tabId: "b", command: "swift test", clear: false },
    { tabId: "missing", command: "nope", clear: false },
    { tabId: "new", command: "echo hi", clear: false },
  ],
  () => "c",
);

assert.equal(
  applied.jobs.some((job) => job.tabId === "b"),
  true,
);
assert.equal(
  applied.jobs.some((job) => job.tabId === "missing"),
  false,
);
assert.equal(
  applied.jobs.some((job) => job.tabId === "a"),
  false,
);
assert.equal(
  applied.tabs.some((tab) => tab.id === "c"),
  true,
);
assert.equal(applied.active, "c");
assert.equal(commandLine("clear"), "clear\r");

const held = releaseHeld(false, [{ text: "swift test\r", clear: false }]);
assert.equal(held.send.length, 0);
assert.equal(held.hold.length, 1);
const sent = releaseHeld(true, held.hold);
assert.equal(sent.send[0]?.text, "swift test\r");
assert.equal(sent.hold.length, 0);
