import {
  createElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readWorkdirFile } from "../../lib/workdir";
import { renderMarkdown, resolveMarkdownAsset } from "./markdown";

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
  "img",
]);

export function MarkdownView({
  text,
  repo,
  file,
}: {
  text: string;
  repo: string;
  file: string;
}) {
  const body = useMemo(
    () => nodesFromMarkdown(text, repo, file),
    [text, repo, file],
  );
  return (
    <div className="markdown-view h-full overflow-auto px-6 py-4">{body}</div>
  );
}

function nodesFromMarkdown(
  source: string,
  repo: string,
  file: string,
): ReactNode[] {
  const document = new DOMParser().parseFromString(
    `<div>${renderMarkdown(source)}</div>`,
    "text/html",
  );
  const root = document.body.firstElementChild;
  if (!root) {
    return [];
  }
  return [...root.childNodes].map((node, index) =>
    toNode(node, index, repo, file),
  );
}

function toNode(
  node: ChildNode,
  key: number,
  repo: string,
  file: string,
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (!(node instanceof Element)) {
    return null;
  }
  const tag = node.tagName.toLowerCase();
  const children = [...node.childNodes].map((child, index) =>
    toNode(child, index, repo, file),
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
  if (tag === "img") {
    return (
      <MarkdownImage
        key={key}
        repo={repo}
        file={file}
        src={node.getAttribute("src") ?? ""}
        alt={node.getAttribute("alt") ?? ""}
      />
    );
  }
  if (tag === "pre" && node.getAttribute("data-lang") === "mermaid") {
    return <MermaidBlock key={key} source={node.textContent ?? ""} />;
  }
  return createElement(tag, { key }, children);
}

function MarkdownImage({
  repo,
  file,
  src,
  alt,
}: {
  repo: string;
  file: string;
  src: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const target = resolveMarkdownAsset(file, src);
    if (!target) {
      setMissing(true);
      setUrl(null);
      return;
    }
    if (
      target.startsWith("https://") ||
      target.startsWith("http://") ||
      target.startsWith("data:image/")
    ) {
      setMissing(false);
      setUrl(target);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setMissing(false);
    setUrl(null);
    readWorkdirFile(repo, target)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (loaded.media && loaded.mime?.startsWith("image/")) {
          setUrl(`data:${loaded.mime};base64,${loaded.media}`);
          return;
        }
        if (target.toLowerCase().endsWith(".svg") && loaded.text) {
          objectUrl = URL.createObjectURL(
            new Blob([loaded.text], { type: "image/svg+xml" }),
          );
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setUrl(objectUrl);
          return;
        }
        setMissing(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [repo, file, src]);

  if (missing) {
    return <span className="text-muted">{alt || src}</span>;
  }
  if (!url) {
    return null;
  }
  return <img alt={alt} src={url} />;
}

function MermaidBlock({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node) {
      return;
    }
    let cancelled = false;
    setFailed(false);
    node.replaceChildren();
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    void import("mermaid")
      .then(async (mod) => {
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          fontFamily: "inherit",
        });
        const rendered = await mermaid.render(id, source);
        if (cancelled || !host.current) {
          return;
        }
        const parsed = new DOMParser().parseFromString(
          rendered.svg,
          "image/svg+xml",
        );
        const svg = parsed.querySelector("svg");
        if (!svg || parsed.querySelector("parsererror")) {
          setFailed(true);
          return;
        }
        host.current.replaceChildren(document.importNode(svg, true));
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <>
      {failed ? (
        <pre>
          <code>{source}</code>
        </pre>
      ) : null}
      <div ref={host} className={failed ? "hidden" : "mermaid-block"} />
    </>
  );
}
