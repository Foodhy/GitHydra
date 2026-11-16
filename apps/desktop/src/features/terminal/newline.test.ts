import assert from "node:assert/strict";
import { withCarriageReturn } from "./newline.ts";

const bare = withCarriageReturn("a\nb", false);
assert.equal(bare.text, "a\r\nb");
assert.equal(bare.precededByCr, false);

const already = withCarriageReturn("a\r\nb", false);
assert.equal(already.text, "a\r\nb");

const splitCr = withCarriageReturn("\nb", true);
assert.equal(splitCr.text, "\nb");

const endsCr = withCarriageReturn("a\r", false);
assert.equal(endsCr.text, "a\r");
assert.equal(endsCr.precededByCr, true);
const next = withCarriageReturn("\nb", endsCr.precededByCr);
assert.equal(next.text, "\nb");
assert.equal(`${endsCr.text}${next.text}`, "a\r\nb");
