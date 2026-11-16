import assert from "node:assert/strict";
import {
  appBundlePath,
  appChoices,
  type InstalledApp,
  selectedApp,
} from "./installed-apps.ts";

const cursor: InstalledApp = {
  name: "Cursor",
  path: "/Applications/Cursor.app",
};

assert.equal(selectedApp("cursor", [cursor]), cursor.path);
assert.equal(selectedApp(cursor.path, [cursor]), cursor.path);
assert.equal(selectedApp("Foo", [cursor]), "Foo");

assert.deepEqual(appChoices("Cursor", [cursor], true), [
  { value: cursor.path, label: "Cursor", missing: false },
]);

assert.deepEqual(appChoices("Foo", [], false), [
  { value: "Foo", label: "Foo", missing: false },
]);
assert.deepEqual(appChoices("Foo", [], true), [
  { value: "Foo", label: "Foo (no está instalada)", missing: true },
]);
assert.deepEqual(appChoices("/Applications/Foo.app", [], true), [
  { value: "/Applications/Foo.app", label: "Foo", missing: false },
]);

assert.equal(
  appBundlePath("/Applications/Foo.app/Contents/Info.plist"),
  "/Applications/Foo.app",
);
assert.equal(appBundlePath("/tmp/note.txt"), null);
