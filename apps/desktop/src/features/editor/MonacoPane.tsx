import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

loader.config({ monaco });

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

export default function MonacoPane({
  value,
  language,
}: {
  value: string;
  language: string;
}) {
  return (
    <Editor
      language={language}
      theme="vs-dark"
      value={value}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: "on",
      }}
      height="100%"
    />
  );
}
