import assert from "node:assert/strict";
import { browserTabLabel } from "./label.ts";

assert.equal(browserTabLabel(null, null), "Browser");
assert.equal(browserTabLabel(null, "One Piece"), "Browser");
assert.equal(
  browserTabLabel("https://example.com/watch", "One Piece"),
  "One Piece · Browser",
);
assert.equal(
  browserTabLabel("http://localhost:5173/app", "Arcade"),
  "Arcade · localhost:5173",
);
assert.equal(browserTabLabel("http://127.0.0.1:3000/", null), "localhost:3000");
assert.equal(browserTabLabel("https://example.com/docs", "  "), "example.com");
assert.equal(browserTabLabel("no es una url", "Notas"), "Notas · Browser");
