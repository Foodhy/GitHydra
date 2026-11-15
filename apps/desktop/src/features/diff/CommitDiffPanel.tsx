import type { CommitDiff, CommitDiffFile } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { PatchView } from "./PatchView";

export function CommitDiffPanel({
  path,
  sha,
  onClear,
  onSelectFile,
}: {
  path: string;
  sha: string;
  onClear: () => void;
  onSelectFile: (file: string) => void;
}) {
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    setError(null);
    tauriGit
      .commitDiff(path, sha)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setDiff(next);
        const first = next.files[0]?.path ?? null;
        setSelected(first);
        if (first) {
          onSelectFile(first);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toGitClientError(reason).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, sha, onSelectFile]);

  const file = diff?.files.find((entry) => entry.path === selected) ?? null;

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-muted">
        <span className="truncate font-mono">{sha.slice(0, 7)}</span>
        <button type="button" onClick={onClear} className="text-accent">
          Ver cambios
        </button>
      </header>
      {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
      {!diff && !error ? (
        <p className="px-3 py-2 text-xs text-muted">Leyendo parche…</p>
      ) : null}
      {diff ? (
        <>
          <ul className="max-h-40 overflow-auto border-b border-line py-1">
            {diff.files.length === 0 ? (
              <li className="px-3 py-1 text-xs text-muted">Sin archivos</li>
            ) : (
              diff.files.map((entry) => (
                <li key={`${entry.kind}:${entry.path}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(entry.path);
                      onSelectFile(entry.path);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-0.5 text-left font-mono text-xs ${
                      entry.path === selected ? "bg-surface-overlay" : ""
                    }`}
                  >
                    <span className="w-4 text-warn">
                      {kindMark(entry.kind)}
                    </span>
                    <span className="truncate" title={entry.path}>
                      {entry.oldPath
                        ? `${entry.oldPath} → ${entry.path}`
                        : entry.path}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {diff.truncated ? (
            <p className="px-3 py-1 text-[11px] text-warn">
              El parche supera el límite y está truncado.
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            {file ? <PatchView patch={file.patch} mode="unido" /> : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}

function kindMark(kind: CommitDiffFile["kind"]): string {
  switch (kind) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
    case "conflicted":
      return "U";
    case "typechange":
      return "T";
  }
}
