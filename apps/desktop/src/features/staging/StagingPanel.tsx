import type { WorkingTreeEntry } from "@githydra/contracts";
import { useState } from "react";
import { useWorkingTree } from "../../hooks/useWorkingTree";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import type { WorkFile } from "../diff/WorkDiffPanel";

export function StagingPanel({
  path,
  revision,
  selected,
  onSelect,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  selected: WorkFile | null;
  onSelect: (file: WorkFile) => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  const { entries, error, loading, reload } = useWorkingTree(path, revision);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();
  const visible = entries.filter((entry) =>
    entry.path.toLowerCase().includes(needle),
  );
  const unstaged = visible.filter((entry) => !entry.staged);
  const staged = visible.filter((entry) => entry.staged);

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
      if (
        filePaths.length === 1 &&
        selected &&
        filePaths[0] === selected.path &&
        selected.staged === fromStaged
      ) {
        onSelect({ path: selected.path, staged: !fromStaged });
      }
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCommit() {
    const nextSummary = summary.trim();
    if (!nextSummary || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await tauriGit.createCommit(path, nextSummary, description.trim());
      setSummary("");
      setDescription("");
      await onRepositoryChanged();
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">
          {loading && entries.length === 0
            ? "Leyendo cambios…"
            : `${entries.length} cambio${entries.length === 1 ? "" : "s"} en el árbol`}
        </p>
        <input
          value={query}
          placeholder="Filtrar archivos"
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 w-full bg-transparent text-xs outline-none placeholder:text-muted"
        />
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
          filtering={needle.length > 0}
          openFolders={openFolders}
          selected={selected}
          onToggleFolder={(folder) =>
            setOpenFolders((current) => ({
              ...current,
              [`Sin stage/${folder}`]: !current[`Sin stage/${folder}`],
            }))
          }
          onSelect={onSelect}
          onMove={(filePaths) => {
            void move(filePaths, false);
          }}
        />
        <FileGroup
          title="En stage"
          entries={staged}
          busy={busy}
          filtering={needle.length > 0}
          openFolders={openFolders}
          selected={selected}
          onToggleFolder={(folder) =>
            setOpenFolders((current) => ({
              ...current,
              [`En stage/${folder}`]: !current[`En stage/${folder}`],
            }))
          }
          onSelect={onSelect}
          onMove={(filePaths) => {
            void move(filePaths, true);
          }}
        />
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void confirmCommit();
        }}
      >
        <input
          value={summary}
          disabled={busy}
          placeholder="Resumen del commit"
          onChange={(event) => setSummary(event.target.value)}
          className="mb-2 w-full rounded border border-line bg-surface px-2 py-1.5 text-sm disabled:text-muted"
        />
        <textarea
          value={description}
          disabled={busy}
          rows={3}
          placeholder="Descripción"
          onChange={(event) => setDescription(event.target.value)}
          className="mb-2 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-sm disabled:text-muted"
        />
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" disabled />
          Enmendar el commit anterior
        </label>
        <button
          type="submit"
          disabled={busy || summary.trim().length === 0}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-surface disabled:bg-accent/40"
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
  filtering,
  openFolders,
  selected,
  onToggleFolder,
  onSelect,
  onMove,
}: {
  title: string;
  entries: WorkingTreeEntry[];
  busy: boolean;
  filtering: boolean;
  openFolders: Record<string, boolean>;
  selected: WorkFile | null;
  onToggleFolder: (folder: string) => void;
  onSelect: (file: WorkFile) => void;
  onMove: (paths: string[]) => void;
}) {
  const tree = groupFiles(entries);
  return (
    <section className="border-b border-line">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs text-muted">
          {title}
          <span className="ml-2">{entries.length}</span>
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
          {tree.loose.map((entry) => (
            <FileRow
              key={`${entry.staged ? "s" : "u"}:${entry.path}:${entry.kind}`}
              entry={entry}
              label={entry.path}
              busy={busy}
              selected={selected}
              onSelect={onSelect}
              onMove={onMove}
            />
          ))}
          {tree.folders.map((folder) => {
            const open =
              filtering || openFolders[`${title}/${folder.name}`] === true;
            return (
              <li key={folder.name}>
                <button
                  type="button"
                  onClick={() => onToggleFolder(folder.name)}
                  className="flex h-7 w-full items-center gap-2 px-3 text-left text-xs text-muted hover:bg-surface-overlay hover:text-text"
                >
                  <span className="w-2 text-[10px]">{open ? "▾" : "▸"}</span>
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span>{folder.entries.length}</span>
                </button>
                {open
                  ? folder.entries.map((entry) => (
                      <FileRow
                        key={`${entry.staged ? "s" : "u"}:${entry.path}:${entry.kind}`}
                        entry={entry}
                        label={entry.path.slice(folder.name.length + 1)}
                        busy={busy}
                        indent
                        selected={selected}
                        onSelect={onSelect}
                        onMove={onMove}
                      />
                    ))
                  : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FileRow({
  entry,
  label,
  busy,
  indent = false,
  selected,
  onSelect,
  onMove,
}: {
  entry: WorkingTreeEntry;
  label: string;
  busy: boolean;
  indent?: boolean;
  selected: WorkFile | null;
  onSelect: (file: WorkFile) => void;
  onMove: (paths: string[]) => void;
}) {
  const active =
    selected?.path === entry.path && selected.staged === entry.staged;
  const slash = label.lastIndexOf("/");
  const dir = slash >= 0 ? label.slice(0, slash + 1) : "";
  const name = slash >= 0 ? label.slice(slash + 1) : label;
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={() => onSelect({ path: entry.path, staged: entry.staged })}
        className={`flex h-7 min-w-0 flex-1 items-center gap-2 text-left font-mono text-xs hover:bg-surface-overlay ${
          indent ? "pr-2 pl-8" : "px-3"
        } ${active ? "bg-surface-overlay" : ""}`}
      >
        <span className={`w-4 shrink-0 ${kindColor(entry.kind)}`}>
          {kindMark(entry.kind)}
        </span>
        <span className="truncate" title={entry.path}>
          {dir ? <span className="text-muted">{dir}</span> : null}
          {name}
        </span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onMove([entry.path])}
        className="px-2 text-[11px] text-accent disabled:text-muted"
      >
        {entry.staged ? "Quitar" : "Stage"}
      </button>
    </li>
  );
}

function groupFiles(entries: WorkingTreeEntry[]): {
  loose: WorkingTreeEntry[];
  folders: { name: string; entries: WorkingTreeEntry[] }[];
} {
  const buckets = new Map<string, WorkingTreeEntry[]>();
  const loose: WorkingTreeEntry[] = [];
  for (const entry of entries) {
    const slash = entry.path.indexOf("/");
    if (slash <= 0) {
      loose.push(entry);
      continue;
    }
    const folder = entry.path.slice(0, slash);
    const items = buckets.get(folder) ?? [];
    items.push(entry);
    buckets.set(folder, items);
  }
  const folders = [...buckets.entries()]
    .map(([name, items]) => ({ name, entries: items }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { loose, folders };
}

function kindColor(kind: WorkingTreeEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "text-accent";
    case "deleted":
      return "text-warn";
    case "modified":
      return "text-graph-edge";
    case "untracked":
      return "text-muted";
    default:
      return "text-warn";
  }
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
