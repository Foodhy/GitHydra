import type { WorkDiff } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { PatchView } from "./PatchView";

export interface WorkFile {
  path: string;
  staged: boolean;
}

type DiffView = "unido" | "lados" | "antes" | "despues";

const VIEWS: { id: DiffView; label: string }[] = [
  { id: "unido", label: "Unido" },
  { id: "lados", label: "Lado a lado" },
  { id: "antes", label: "Antes" },
  { id: "despues", label: "Después" },
];

export function WorkDiffPanel({
  path,
  file,
  onSelect,
}: {
  path: string;
  file: WorkFile;
  onSelect: (file: WorkFile) => void;
}) {
  const [diff, setDiff] = useState<WorkDiff | null>(null);
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DiffView>("lados");
  const index = files.findIndex(
    (entry) => entry.path === file.path && entry.staged === file.staged,
  );

  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    setError(null);
    tauriGit
      .workingTreeStatus(path)
      .then((status) => {
        if (!cancelled) {
          setFiles(
            status.entries.map((entry) => ({
              path: entry.path,
              staged: entry.staged,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
        }
      });
    tauriGit
      .workingTreeDiff(path, file.path, file.staged)
      .then((next) => {
        if (!cancelled) {
          setDiff(next);
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
  }, [path, file.path, file.staged]);

  function step(direction: -1 | 1) {
    if (files.length === 0) {
      return;
    }
    const next =
      index < 0 ? 0 : (index + direction + files.length) % files.length;
    const chosen = files[next];
    if (chosen) {
      onSelect(chosen);
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={file.path}
        >
          {file.path}
          <span className="ml-2 text-muted">
            {file.staged ? "en stage" : "sin stage"}
          </span>
        </p>
        <div className="flex gap-1">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`rounded px-2 py-1 text-[11px] ${
                view === item.id ? "bg-surface-overlay text-text" : "text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded px-2 py-1 text-[11px] text-accent"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded px-2 py-1 text-[11px] text-accent"
          >
            Siguiente
          </button>
        </div>
      </header>
      {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
      {!diff && !error ? (
        <p className="px-3 py-2 text-xs text-muted">Leyendo el cambio…</p>
      ) : null}
      {diff ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <PatchView patch={diff.patch} mode={view} />
        </div>
      ) : null}
    </section>
  );
}
