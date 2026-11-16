import assert from "node:assert/strict";
import { normalizeUrl } from "./url.ts";

assert.equal(normalizeUrl(""), null);
assert.equal(normalizeUrl("   "), null);
assert.equal(normalizeUrl("javascript:alert(1)"), null);
assert.equal(normalizeUrl("file:///tmp/a"), null);
assert.equal(normalizeUrl("http://"), null);

assert.equal(normalizeUrl("https://example.com"), "https://example.com");
assert.equal(normalizeUrl("http://localhost:3000"), "http://localhost:3000");
assert.equal(
  normalizeUrl("http://127.0.0.1:5173/app"),
  "http://127.0.0.1:5173/app",
);

assert.equal(normalizeUrl("localhost:3000"), "http://localhost:3000");
assert.equal(normalizeUrl("127.0.0.1:8080"), "http://127.0.0.1:8080");
assert.equal(normalizeUrl("[::1]:8080"), "http://[::1]:8080");
assert.equal(normalizeUrl("localhost"), "http://localhost");

assert.equal(normalizeUrl("example.com:8080"), "https://example.com:8080");
assert.equal(normalizeUrl("example.com"), "https://example.com");
assert.equal(normalizeUrl("example.com/docs"), "https://example.com/docs");
assert.equal(normalizeUrl("  example.com  "), "https://example.com");
