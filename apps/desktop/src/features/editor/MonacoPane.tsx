import Editor, { type OnMount } from "@monaco-editor/react";
import { useMemo, useRef } from "react";
import { getUiScale, onUiScale } from "../../lib/ui-scale";
import { defineGitHydraTheme } from "./monaco";

export type MonacoEditor = Parameters<OnMount>[0];

function editorFont(scale: number): { fontSize: number; lineHeight: number } {
  return {
    fontSize: Math.round(13 * scale),
    lineHeight: Math.round(20 * scale),
  };
}

export interface CursorPoint {
  line: number;
  column: number;
}

export default function MonacoPane({
  initialValue,
  language,
  readOnly,
  wordWrap,
  tabSize,
  insertSpaces,
  onChange,
  onReady,
  onCursor,
}: {
  initialValue: string;
  language: string;
  readOnly: boolean;
  wordWrap: boolean;
  tabSize: number;
  insertSpaces: boolean;
  onChange: (text: string) => void;
  onReady: (editor: MonacoEditor | null) => void;
  onCursor: (cursor: CursorPoint) => void;
}) {
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onCursorRef = useRef(onCursor);
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;
  onCursorRef.current = onCursor;

  const options = useMemo(
    () => ({
      readOnly,
      domReadOnly: readOnly,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: editorFont(getUiScale()).fontSize,
      fontFamily: "SF Mono, ui-monospace, monospace",
      lineHeight: editorFont(getUiScale()).lineHeight,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on" as const,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
      tabSize,
      insertSpaces,
      detectIndentation: false,
      folding: true,
      foldingHighlight: true,
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: true },
      stickyScroll: { enabled: true },
      renderWhitespace: "selection" as const,
      renderLineHighlight: "line" as const,
      matchBrackets: "always" as const,
      links: true,
      colorDecorators: true,
      mouseWheelZoom: true,
      multiCursorModifier: "alt" as const,
      padding: { top: 8, bottom: 8 },
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      occurrencesHighlight: "singleFile" as const,
    }),
    [insertSpaces, readOnly, tabSize, wordWrap],
  );

  return (
    <Editor
      defaultValue={initialValue}
      language={language}
      theme="githydra"
      beforeMount={defineGitHydraTheme}
      onChange={(next) => onChangeRef.current(next ?? "")}
      onMount={(editor, instance) => {
        const model = editor.getModel();
        if (model?.getEOL() === "\n" && initialValue.includes("\r\n")) {
          model.setEOL(instance.editor.EndOfLineSequence.CRLF);
        }
        const report = () => {
          const position = editor.getPosition();
          onCursorRef.current(
            position
              ? { line: position.lineNumber, column: position.column }
              : { line: 1, column: 1 },
          );
        };
        report();
        const applyScale = (scale: number) => {
          const next = editorFont(scale);
          editor.updateOptions(next);
        };
        applyScale(getUiScale());
        const stopScale = onUiScale(applyScale);
        const subscription = editor.onDidChangeCursorPosition(report);
        const ready = onReadyRef.current;
        ready(editor);
        editor.onDidDispose(() => {
          stopScale();
          subscription.dispose();
          ready(null);
        });
      }}
      options={options}
      height="100%"
    />
  );
}
