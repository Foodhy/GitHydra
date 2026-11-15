import assert from "node:assert/strict";
import { languageOf, previewKind } from "./language.ts";

assert.equal(languageOf("apps/bun.lock"), "json");
assert.equal(languageOf("Cargo.lock"), "ini");
assert.equal(languageOf(".gitignore"), "ignore");
assert.equal(languageOf(".env.local"), "dotenv");
assert.equal(languageOf("src/app.tsx"), "typescript");
assert.equal(languageOf("docs/SCAN_REPORT.md"), "markdown");
assert.equal(previewKind("docs/SCAN_REPORT.md"), "markdown");
assert.equal(previewKind("icon.svg"), "svg");
assert.equal(previewKind("src/app.ts"), null);
