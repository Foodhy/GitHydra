import assert from "node:assert/strict";
import test from "node:test";
import { shouldOnboard } from "./onboarding.ts";

test("el onboarding sale solo la primera vez, sin recientes", () => {
  assert.equal(shouldOnboard(false, 0), true);
  assert.equal(shouldOnboard(true, 0), false);
  assert.equal(shouldOnboard(false, 1), false);
  assert.equal(shouldOnboard(true, 4), false);
});
