import { DiffEditor, Editor } from "@monaco-editor/react";
import { useMemo } from "react";
import { languageOf } from "../editor/language";
import { defineGitHydraTheme } from "../editor/monaco";

type DiffMode = "unido" | "lados" | "antes" | "despues";

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
        beforeMount={defineGitHydraTheme}
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
      beforeMount={defineGitHydraTheme}
      options={options}
      height="100%"
    />
  );
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
