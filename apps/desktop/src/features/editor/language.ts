const NAMES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "shell",
  gemfile: "ruby",
  rakefile: "ruby",
  "bun.lock": "json",
  "cargo.lock": "ini",
  "composer.lock": "json",
  "package-lock.json": "json",
  "pnpm-lock.yaml": "yaml",
  "pnpm-workspace.yaml": "yaml",
  ".gitignore": "ignore",
  ".npmignore": "ignore",
  ".prettierignore": "ignore",
  ".eslintignore": "ignore",
  ".gitattributes": "ignore",
  ".editorconfig": "ini",
  ".env": "dotenv",
  ".env.local": "dotenv",
  ".env.example": "dotenv",
};

const LANGUAGES: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  rs: "rust",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  xml: "xml",
  svg: "xml",
  go: "go",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  java: "java",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  cs: "csharp",
  dockerfile: "dockerfile",
};

const LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  markdown: "Markdown",
  plaintext: "Texto",
  shell: "Shell",
  yaml: "YAML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  json: "JSON",
  rust: "Rust",
  python: "Python",
  ini: "TOML",
  xml: "XML",
  go: "Go",
  sql: "SQL",
  graphql: "GraphQL",
  c: "C",
  cpp: "C++",
  java: "Java",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  lua: "Lua",
  csharp: "C#",
  dockerfile: "Dockerfile",
  ignore: "Ignore",
  dotenv: "Env",
};

export function languageOf(path: string): string {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const named = NAMES[name];
  if (named) {
    return named;
  }
  if (name.startsWith(".env")) {
    return "dotenv";
  }
  if (name.endsWith("ignore")) {
    return "ignore";
  }
  if (name === "cargo.lock") {
    return "ini";
  }
  if (name.endsWith(".lock")) {
    return "json";
  }
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1)
    : "";
  return LANGUAGES[extension] ?? "plaintext";
}

export function previewKind(path: string): "markdown" | "svg" | null {
  if (languageOf(path) === "markdown") {
    return "markdown";
  }
  const name = (path.split("/").pop() ?? path).toLowerCase();
  if (name.endsWith(".svg")) {
    return "svg";
  }
  return null;
}

export function languageLabel(language: string): string {
  return LABELS[language] ?? language;
}

export function eolOf(text: string): "CRLF" | "LF" {
  return text.includes("\r\n") ? "CRLF" : "LF";
}

export function indentOf(text: string): {
  tabSize: number;
  insertSpaces: boolean;
  label: string;
} {
  const lines = text.split(/\r?\n/).slice(0, 200);
  for (const line of lines) {
    if (line.startsWith("\t")) {
      return { tabSize: 4, insertSpaces: false, label: "Tabulación" };
    }
    const spaces = line.match(/^( +)\S/)?.[1].length ?? 0;
    if (spaces > 0) {
      const size = spaces === 2 || spaces === 4 || spaces === 8 ? spaces : 2;
      return {
        tabSize: size,
        insertSpaces: true,
        label: `Espacios: ${size}`,
      };
    }
  }
  return { tabSize: 2, insertSpaces: true, label: "Espacios: 2" };
}
