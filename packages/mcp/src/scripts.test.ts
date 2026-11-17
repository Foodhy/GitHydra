import assert from "node:assert/strict";
import {
  emptyScripts,
  parseScripts,
  pinScript,
  putScript,
  serializeScripts,
  visiblePins,
} from "@githydra/contracts";

const empty = parseScripts('{"pinned":[],"scripts":{}}');
assert.equal("book" in empty, true);

const bad = parseScripts("{");
assert.equal("error" in bad, true);

const named = putScript(emptyScripts(), "test", "swift test");
assert.equal("book" in named && named.book.scripts.test, "swift test");
const replaced = putScript(
  "book" in named ? named.book : emptyScripts(),
  "test",
  "swift test --filter App",
);
assert.equal(
  "book" in replaced && replaced.book.scripts.test,
  "swift test --filter App",
);
assert.equal("error" in putScript(emptyScripts(), "", "swift test"), true);
assert.equal("error" in putScript(emptyScripts(), "test", "a\nb"), true);

const book = "book" in replaced ? replaced.book : emptyScripts();
const withBoot = putScript(book, "boot", "xcrun simctl list");
const ready = "book" in withBoot ? withBoot.book : book;
const pinned = pinScript(ready, "test", true);
assert.equal("book" in pinned && pinned.book.pinned[0], "test");
const second = pinScript("book" in pinned ? pinned.book : ready, "boot", true);
const third = putScript(
  "book" in second ? second.book : ready,
  "lint",
  "swiftlint",
);
const fourth = putScript(
  "book" in third ? third.book : ready,
  "extra",
  "echo extra",
);
const full = "book" in fourth ? fourth.book : ready;
const one = pinScript(full, "lint", true);
assert.equal("book" in one, true);
const two = pinScript("book" in one ? one.book : full, "extra", true);
assert.equal("error" in two, true);

const shown = visiblePins(ready);
assert.deepEqual(shown, ["boot", "test"]);
assert.equal(serializeScripts(ready).includes('"scripts"'), true);
