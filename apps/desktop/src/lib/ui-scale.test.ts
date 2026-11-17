import assert from "node:assert/strict";
import { normalizeUiScale, stepUiScale } from "./ui-scale.ts";

assert.equal(normalizeUiScale(Number.NaN), 1);
assert.equal(normalizeUiScale(1), 1);
assert.equal(normalizeUiScale(0.94), 0.9);
assert.equal(stepUiScale(1, 1), 1.1);
assert.equal(stepUiScale(1, -1), 0.9);
assert.equal(stepUiScale(0.8, -1), 0.8);
assert.equal(stepUiScale(1.4, 1), 1.4);
