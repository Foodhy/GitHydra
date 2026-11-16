import assert from "node:assert/strict";
import { holdRemaining } from "./activity-hold.ts";

assert.equal(holdRemaining(1_000, 1_000), 700);
assert.equal(holdRemaining(1_000, 1_400), 300);
assert.equal(holdRemaining(1_000, 1_700), 0);
assert.equal(holdRemaining(1_000, 2_500), 0);
assert.equal(holdRemaining(1_000, 1_050, 200), 150);
