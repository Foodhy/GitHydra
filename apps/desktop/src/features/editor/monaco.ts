import { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

loader.config({ monaco });

registerExtraLanguages();

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

function registerExtraLanguages(): void {
  const known = new Set(
    monaco.languages.getLanguages().map((language) => language.id),
  );
  if (!known.has("ignore")) {
    monaco.languages.register({ id: "ignore" });
  }
  monaco.languages.setMonarchTokensProvider("ignore", {
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/^!.*$/, "string"],
        [/^\s*$/, ""],
        [/.+/, "keyword"],
      ],
    },
  });
  if (!known.has("dotenv")) {
    monaco.languages.register({ id: "dotenv" });
  }
  monaco.languages.setMonarchTokensProvider("dotenv", {
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/^\s*[A-Za-z_][\w.]*(?==)/, "type"],
        [/=/, "delimiter"],
        [/.*/, "string"],
      ],
    },
  });
  const quiet = {
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  };
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(quiet);
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(quiet);
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.typescript.JsxEmit.React,
    allowNonTsExtensions: true,
  });
}

export function defineGitHydraTheme(instance: Monaco): void {
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
      "editorLineNumber.activeForeground": color("--color-text", "#e7e9ef"),
      "editor.lineHighlightBackground": color(
        "--color-surface-raised",
        "#1b1e27",
      ),
      "editor.selectionBackground": `${accent}44`,
      "editorCursor.foreground": accent,
      "editorWidget.background": color("--color-surface-overlay", "#232733"),
      "editorWidget.border": color("--color-line", "#2e3442"),
      "minimap.background": color("--color-surface", "#12141a"),
      "diffEditor.insertedTextBackground": `${accent}33`,
      "diffEditor.removedTextBackground": `${warn}33`,
      "diffEditor.insertedLineBackground": `${accent}22`,
      "diffEditor.removedLineBackground": `${warn}22`,
    },
  });
}
