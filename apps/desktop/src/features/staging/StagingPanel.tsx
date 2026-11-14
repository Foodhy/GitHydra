import type { WorkingTreeEntry } from "@githydra/contracts";
import { useState } from "react";
import { useWorkingTree } from "../../hooks/useWorkingTree";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";

export function StagingPanel({ path }: { path: string }) {
  const { entries, error, loading, reload } = useWorkingTree(path);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unstaged = entries.filter((entry) => !entry.staged);
  const staged = entries.filter((entry) => entry.staged);

  async function move(filePaths: string[], fromStaged: boolean) {
    if (filePaths.length === 0 || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (fromStaged) {
        await tauriGit.unstagePaths(path, filePaths);
      } else {
        await tauriGit.stagePaths(path, filePaths);
      }
      reload();
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2 text-xs text-muted">
        {loading && entries.length === 0
          ? "Leyendo cambios…"
          : `${entries.length} cambio${entries.length === 1 ? "" : "s"} en el árbol`}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
        {actionError ? (
          <p className="px-3 py-2 text-xs text-warn">{actionError}</p>
        ) : null}
        <FileGroup
          title="Sin stage"
          entries={unstaged}
          busy={busy}
          onMove={(filePaths) => {
            void move(filePaths, false);
          }}
        />
        <FileGroup
          title="En stage"
          entries={staged}
          busy={busy}
          onMove={(filePaths) => {
            void move(filePaths, true);
          }}
        />
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          disabled
          placeholder="Resumen del commit"
          className="mb-2 w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-muted"
        />
        <textarea
          disabled
          rows={3}
          placeholder="Descripción"
          className="mb-2 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-sm text-muted"
        />
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" disabled />
          Enmendar el commit anterior
        </label>
        <button
          type="button"
          disabled
          title="Confirmar · próxima fase"
          className="w-full rounded bg-accent/40 px-3 py-2 text-sm font-medium text-surface"
        >
          Confirmar
        </button>
      </form>
    </aside>
  );
}

function FileGroup({
  title,
  entries,
  busy,
  onMove,
}: {
  title: string;
  entries: WorkingTreeEntry[];
  busy: boolean;
  onMove: (paths: string[]) => void;
}) {
  return (
    <section className="border-b border-line">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">
          {title}
        </h2>
        {entries.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove(entries.map((entry) => entry.path))}
            className="text-[11px] text-accent disabled:text-muted"
          >
            Todos
          </button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-muted">Vacío</p>
      ) : (
        <ul className="pb-2">
          {entries.map((entry) => (
            <li key={`${entry.staged ? "s" : "u"}:${entry.path}:${entry.kind}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onMove([entry.path])}
                className="flex w-full items-center gap-2 px-3 py-0.5 text-left font-mono text-xs hover:bg-surface-overlay disabled:opacity-60"
              >
                <span className="w-4 text-warn">{kindMark(entry.kind)}</span>
                <span className="truncate" title={entry.path}>
                  {entry.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function kindMark(kind: WorkingTreeEntry["kind"]): string {
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
