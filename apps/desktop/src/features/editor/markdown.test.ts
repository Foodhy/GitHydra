import assert from "node:assert/strict";
import { renderMarkdown, resolveMarkdownAsset } from "./markdown.ts";

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

const pictures = renderMarkdown(
  "![logo](./img/logo.png)\n\n![web](https://example.com/a.png)\n\n![malo](javascript:alert(1))\n\n```mermaid\ngraph TD\n  A-->B\n```\n",
);
assert.match(pictures, /<img alt="logo" src="\.\/img\/logo\.png" \/>/);
assert.match(pictures, /src="https:\/\/example\.com\/a\.png"/);
assert.equal(pictures.includes("javascript:"), false);
assert.match(pictures, /data-lang="mermaid"/);
assert.match(pictures, /A--&gt;B/);

assert.equal(
  resolveMarkdownAsset("docs/README.md", "../assets/shot.png"),
  "assets/shot.png",
);
assert.equal(resolveMarkdownAsset("README.md", "../../secret.png"), null);
assert.equal(
  resolveMarkdownAsset("README.md", "https://example.com/a.png"),
  "https://example.com/a.png",
);
