import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.ts";

const html = renderMarkdown(
  "# Título\n\nTexto **fuerte** y `código`.\n\n<script>alert(1)</script>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[sitio](https://example.com)\n[malo](javascript:alert(1))\n",
);

assert.match(html, /<h1>Título<\/h1>/);
assert.match(html, /<strong>fuerte<\/strong>/);
assert.match(html, /<code>código<\/code>/);
assert.match(html, /&lt;script&gt;/);
assert.equal(html.includes("<script>"), false);
assert.match(html, /<th>A<\/th>/);
assert.match(html, /href="https:\/\/example.com"/);
assert.equal(html.includes("javascript:"), false);
