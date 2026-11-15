import { DiffEditor, Editor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useMemo } from "react";

loader.config({ monaco });

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

type DiffMode = "unido" | "lados" | "antes" | "despues";

const LANGUAGES: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  rs: "rust",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  sh: "shell",
  xml: "xml",
};

export function languageOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return LANGUAGES[extension] ?? "plaintext";
}

export function CodeDiff({
  filePath,
  before,
  after,
  mode,
}: {
  filePath: string;
  before: string;
  after: string;
  mode: DiffMode;
}) {
  const language = languageOf(filePath);
  const options = useMemo(
    () => ({
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      wordWrap: "off" as const,
      renderSideBySide: mode === "lados",
      originalEditable: false,
      renderOverviewRuler: false,
    }),
    [mode],
  );

  if (mode === "antes" || mode === "despues") {
    return (
      <Editor
        language={language}
        theme="githydra"
        value={mode === "antes" ? before : after}
        beforeMount={defineTheme}
        options={options}
        height="100%"
      />
    );
  }

  return (
    <DiffEditor
      language={language}
      theme="githydra"
      original={before}
      modified={after}
      beforeMount={defineTheme}
      options={options}
      height="100%"
    />
  );
}

function defineTheme(instance: typeof monaco) {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const accent = color("--color-accent", "#3ee0b0");
  const warn = color("--color-warn", "#e6b35a");
  instance.editor.defineTheme("githydra", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": color("--color-surface", "#12141a"),
      "editor.foreground": color("--color-text", "#e7e9ef"),
      "editorLineNumber.foreground": color("--color-muted", "#8d95a8"),
      "diffEditor.insertedTextBackground": `${accent}33`,
      "diffEditor.removedTextBackground": `${warn}33`,
      "diffEditor.insertedLineBackground": `${accent}22`,
      "diffEditor.removedLineBackground": `${warn}22`,
    },
  });
}

export function noteOf(text: string): string | null {
  const trimmed = text.trim();
  if (
    trimmed.startsWith("Archivo binario") ||
    trimmed.startsWith("El archivo supera") ||
    trimmed.startsWith("Parche truncado")
  ) {
    return trimmed;
  }
  return null;
}

export function sideText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("Este lado no tiene el archivo")) {
    return "";
  }
  return text;
}
