import { fileName } from "./session";

export function FileGlyph({
  path,
  kind,
  open = false,
}: {
  path: string;
  kind: "file" | "dir";
  open?: boolean;
}) {
  const tone = kind === "dir" ? folderTone(path) : fileTone(path);
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${tone}`}
    >
      {kind === "dir" ? <FolderShape open={open} /> : <FileShape path={path} />}
    </svg>
  );
}

function FolderShape({ open }: { open: boolean }) {
  if (open) {
    return (
      <path
        fill="currentColor"
        d="M1.5 4.5h4.2l1 1.4h7.8v1.2H2.2L1.5 13.5h13l.8-6.4H1.5V4.5Z"
      />
    );
  }
  return (
    <path
      fill="currentColor"
      d="M1.5 3.5h4.3l1.1 1.4H14.5v7.6H1.5V3.5Zm1.2 2.2v5.6h10.6V6.1H6.2L5.2 4.7H2.7v1Z"
    />
  );
}

function FileShape({ path }: { path: string }) {
  const kind = glyphKind(path);
  if (kind === "image") {
    return (
      <path
        fill="currentColor"
        d="M2 3.2h12v9.6H2V3.2Zm1.2 1.2v5.4l2.2-2.1 1.8 1.7 2.4-2.6 2.2 2.4V4.4H3.2Zm1.3 1.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
      />
    );
  }
  if (kind === "code") {
    return (
      <path
        fill="currentColor"
        d="M6.2 4.2 2.6 8l3.6 3.8 1.1-1.1L4.8 8l2.5-2.7-1.1-1.1Zm3.6 0L9.7 5.3 12.2 8 9.7 10.7l1.1 1.1L14.4 8 9.8 4.2ZM7.2 12.2h1.2L9 3.8H7.8L7.2 12.2Z"
      />
    );
  }
  if (kind === "data") {
    return (
      <path
        fill="currentColor"
        d="M3 3.2h6.2L13 7v5.8H3V3.2Zm6 1.3V7h2.4L9 4.5ZM4.6 8.2h6.8v1.1H4.6V8.2Zm0 2h4.6v1.1H4.6v-1.1Z"
      />
    );
  }
  if (kind === "prose") {
    return (
      <path
        fill="currentColor"
        d="M3 2.8h10v10.4H3V2.8Zm1.3 1.6v1.1h7.4V4.4H4.3Zm0 2.2v1h7.4v-1H4.3Zm0 2.2v1h5.2v-1H4.3Z"
      />
    );
  }
  if (kind === "lock") {
    return (
      <path
        fill="currentColor"
        d="M5 7V5.2a3 3 0 0 1 6 0V7h1.2v6.2H3.8V7H5Zm1.2 0h3.6V5.2a1.8 1.8 0 0 0-3.6 0V7Zm1.2 2.1v2.3h1.2V9.1H7.4Z"
      />
    );
  }
  if (kind === "config") {
    return (
      <path
        fill="currentColor"
        d="M6.7 1.8h2.6l.3 1.6 1.5.6 1.3-1 1.8 1.8-1 1.3.6 1.5 1.6.3v2.6l-1.6.3-.6 1.5 1 1.3-1.8 1.8-1.3-1-1.5.6-.3 1.6H6.7l-.3-1.6-1.5-.6-1.3 1-1.8-1.8 1-1.3-.6-1.5-1.6-.3V7.2l1.6-.3.6-1.5-1-1.3 1.8-1.8 1.3 1 1.5-.6.3-1.6ZM8 6.3A1.7 1.7 0 1 0 8 9.7 1.7 1.7 0 0 0 8 6.3Z"
      />
    );
  }
  return (
    <path
      fill="currentColor"
      d="M4 1.8h5.2L13 5.6v8.6H4V1.8Zm5 1.2v2.8H11.8L9 3ZM5.4 7.2h5.2v1.1H5.4V7.2Zm0 2.1h5.2v1.1H5.4V9.3Z"
    />
  );
}

function glyphKind(
  path: string,
): "image" | "code" | "data" | "prose" | "lock" | "config" | "file" {
  const name = fileName(path).toLowerCase();
  if (name.endsWith(".lock")) {
    return "lock";
  }
  if (
    name.startsWith(".git") ||
    name.endsWith("ignore") ||
    name.startsWith(".env") ||
    name.endsWith(".toml") ||
    name.endsWith(".ini")
  ) {
    return "config";
  }
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1)
    : "";
  if (
    [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "bmp",
      "ico",
      "avif",
      "svg",
      "pdf",
    ].includes(extension)
  ) {
    return "image";
  }
  if (["md", "mdx", "txt", "rst"].includes(extension)) {
    return "prose";
  }
  if (["json", "yaml", "yml", "xml", "csv", "toml"].includes(extension)) {
    return "data";
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "rs",
      "py",
      "go",
      "css",
      "scss",
      "html",
      "vue",
      "svelte",
      "sh",
      "bash",
      "rb",
      "php",
      "java",
      "c",
      "cpp",
      "swift",
      "kt",
    ].includes(extension)
  ) {
    return "code";
  }
  return "file";
}

function fileTone(path: string): string {
  const name = fileName(path).toLowerCase();
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1)
    : "";
  if (
    ["ts", "tsx", "js", "jsx", "css", "scss", "html", "vue", "py"].includes(
      extension,
    )
  ) {
    return "text-graph-edge";
  }
  if (["md", "mdx", "rs", "json", "yml", "yaml", "svg"].includes(extension)) {
    return "text-accent";
  }
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "pdf"].includes(extension) ||
    name.endsWith("ignore")
  ) {
    return "text-warn";
  }
  return "text-muted";
}

function folderTone(path: string): string {
  const name = fileName(path).toLowerCase();
  if (
    ["node_modules", "dist", "target", ".git", "coverage", "vendor"].includes(
      name,
    )
  ) {
    return "text-muted";
  }
  if (["src", "app", "apps", "packages", "scripts", "lib"].includes(name)) {
    return "text-accent";
  }
  if (["docs", "doc", "assets", "public", "static", "images"].includes(name)) {
    return "text-graph-edge";
  }
  return "text-warn";
}
