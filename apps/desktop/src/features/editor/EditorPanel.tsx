import { lazy, Suspense, useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";

const MonacoPane = lazy(() => import("./MonacoPane"));

export function EditorPanel({
  path,
  sha,
  file,
}: {
  path: string;
  sha: string | null;
  file: string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sha || !file) {
      return;
    }
    let cancelled = false;
    setError(null);
    tauriGit
      .readCommitFile(path, sha, file)
      .then((text) => {
        if (!cancelled) {
          setValue(text);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setValue("");
          setError(toGitClientError(reason).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, sha, file]);

  if (!sha || !file) {
    return (
      <p className="p-3 text-xs text-muted">Elige un archivo en el diff.</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="truncate border-b border-line px-3 py-1 font-mono text-[11px] text-muted">
        {file}
      </p>
      {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={<p className="p-3 text-xs text-muted">Cargando editor…</p>}
        >
          <MonacoPane value={value} language={languageOf(file)} />
        </Suspense>
      </div>
    </div>
  );
}

function languageOf(file: string): string {
  const extension = file.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "rs":
      return "rust";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    default:
      return "plaintext";
  }
}
