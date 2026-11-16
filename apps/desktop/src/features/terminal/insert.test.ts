import assert from "node:assert/strict";
import { pathFromDrop, shellToken } from "./insert.ts";

assert.equal(shellToken("src/app.ts"), "src/app.ts ");
assert.equal(shellToken("docs/mi archivo.md"), "'docs/mi archivo.md' ");
assert.equal(shellToken("it's.md"), `'it'\\''s.md' `);
assert.equal(pathFromDrop("githydra-path:src/app.ts"), "src/app.ts");
assert.equal(pathFromDrop("src/app.ts"), null);
assert.equal(pathFromDrop("githydra-path:"), null);
