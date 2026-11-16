import assert from "node:assert/strict";
import {
  applyText,
  classifyCommitText,
  closeTab,
  closeWorkPath,
  confirmDiscard,
  emptySession,
  isDirty,
  pinTab,
  refreshIfClean,
  requestClose,
  requestOpen,
  retargetWorkPath,
} from "./session.ts";

const session = emptySession();
const opened = requestOpen(session, "src/app.ts", null);
assert.equal(opened.active, "work:src/app.ts");
assert.equal(opened.tabs.length, 1);
assert.equal(opened.tabs[0]?.readOnly, false);
assert.equal(opened.tabs[0]?.preview, false);

const again = requestOpen(opened, "src/app.ts", null);
assert.equal(again.tabs.length, 1);
assert.equal(again.active, "work:src/app.ts");

const loaded = applyText(opened, "work:src/app.ts", {
  text: "uno\n",
  binary: false,
  truncated: false,
  error: null,
  mime: null,
  media: null,
});
assert.equal(loaded.tabs[0]?.text, "uno\n");
assert.equal(isDirty(loaded.tabs[0]), false);

const edited = {
  ...loaded,
  tabs: loaded.tabs.map((tab) => ({ ...tab, text: "dos\n" })),
};
assert.equal(isDirty(edited.tabs[0]), true);
const pending = requestClose(edited, "work:src/app.ts");
assert.equal(pending.pendingClose, "work:src/app.ts");
assert.equal(pending.tabs.length, 1);
const discarded = confirmDiscard(pending);
assert.equal(discarded.tabs.length, 0);
assert.equal(discarded.pendingClose, null);

const firstCommit = requestOpen(opened, "src/app.ts", "abc");
const secondCommit = requestOpen(firstCommit, "README.md", "def");
assert.equal(secondCommit.tabs.length, 2);
assert.equal(
  secondCommit.tabs.some((tab) => tab.sha === "abc"),
  false,
);
assert.equal(secondCommit.active, "commit:def:README.md");
const pinned = pinTab(firstCommit, "commit:abc:src/app.ts");
const kept = requestOpen(pinned, "README.md", "def");
assert.equal(kept.tabs.length, 3);

const clean = applyText(opened, "work:src/app.ts", {
  text: "uno\n",
  binary: false,
  truncated: false,
  error: null,
  mime: null,
  media: null,
});
const same = refreshIfClean(clean, "work:src/app.ts", {
  text: "uno\n",
  binary: false,
  truncated: false,
});
assert.equal(same, clean);
const refreshed = refreshIfClean(clean, "work:src/app.ts", {
  text: "tres\n",
  binary: false,
  truncated: false,
});
assert.equal(refreshed.tabs[0]?.generation, 1);
assert.equal(refreshed.tabs[0]?.text, "tres\n");

const closed = closeTab(opened, "work:src/app.ts");
assert.equal(closed.active, null);

const binary = classifyCommitText("Archivo binario, sin vista de texto.");
assert.equal(binary.binary, true);
const missing = classifyCommitText("El commit no tiene notas.txt");
assert.equal(missing.error, "El commit no tiene notas.txt");

const nested = requestOpen(
  requestOpen(opened, "docs/guia.md", null),
  "docs/extra.md",
  null,
);
const moved = retargetWorkPath(nested, "docs", "notas");
assert.equal(
  moved.tabs.some((tab) => tab.path === "notas/guia.md"),
  true,
);
assert.equal(
  moved.tabs.some((tab) => tab.path === "notas/extra.md"),
  true,
);
assert.equal(
  moved.tabs.some((tab) => tab.id === "work:src/app.ts"),
  true,
);
const cleared = closeWorkPath(moved, "notas");
assert.equal(cleared.tabs.length, 1);
assert.equal(cleared.tabs[0]?.path, "src/app.ts");
