import { createElement, type ReactNode, useMemo } from "react";
import { renderMarkdown } from "./markdown";

const ALLOWED = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "pre",
  "code",
  "strong",
  "em",
  "a",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
]);

export function MarkdownView({ text }: { text: string }) {
  const body = useMemo(() => nodesFromMarkdown(text), [text]);
  return (
    <div className="markdown-view h-full overflow-auto px-6 py-4">{body}</div>
  );
}

function nodesFromMarkdown(source: string): ReactNode[] {
  const document = new DOMParser().parseFromString(
    `<div>${renderMarkdown(source)}</div>`,
    "text/html",
  );
  const root = document.body.firstElementChild;
  if (!root) {
    return [];
  }
  return [...root.childNodes].map((node, index) => toNode(node, index));
}

function toNode(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (!(node instanceof Element)) {
    return null;
  }
  const tag = node.tagName.toLowerCase();
  const children = [...node.childNodes].map((child, index) =>
    toNode(child, index),
  );
  if (!ALLOWED.has(tag)) {
    return children;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") ?? "";
    const safe =
      href.startsWith("https://") ||
      href.startsWith("http://") ||
      href.startsWith("mailto:") ||
      href.startsWith("#") ||
      href.startsWith("/");
    return safe ? (
      <a key={key} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <span key={key}>{children}</span>
    );
  }
  if (tag === "hr") {
    return <hr key={key} />;
  }
  return createElement(tag, { key }, children);
}
