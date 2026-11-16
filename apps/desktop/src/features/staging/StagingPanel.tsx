import type {
  CommitAuthor,
  StashEntry,
  WorkingTreeEntry,
} from "@githydra/contracts";
import { type MouseEvent, useEffect, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useWorkingTree } from "../../hooks/useWorkingTree";
import { discardPrompt } from "../../lib/discard-prompt";
import { formatWhen } from "../../lib/format";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { runOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import type { WorkFile } from "../diff/WorkDiffPanel";

export function StagingPanel({
  path,
  revision,
  selected,
  onSelect,
  onOpenFile,
  onDiscarded,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  selected: WorkFile | null;
  onSelect: (file: WorkFile) => void;
  onOpenFile: (file: string) => void;
  onDiscarded: () => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  const { entries, error, loading, refreshing, reload } = useWorkingTree(
    path,
    revision,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useOperation((state) => state.running);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [authors, setAuthors] = useState<CommitAuthor[]>([]);
  const [authorEmail, setAuthorEmail] = useState("");
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    entry: WorkingTreeEntry;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    void tauriGit
      .listCommitAuthors(path)
      .then((list) => {
        if (!alive) {
          return;
        }
        setAuthors(list);
        const current = list.find((author) => author.current) ?? list[0];
        setAuthorEmail(current?.email ?? "");
      })
      .catch(() => {
        if (alive) {
          setAuthors([]);
          setAuthorEmail("");
        }
      });
    return () => {
      alive = false;
    };
  }, [path]);

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

  async function discard(entry: WorkingTreeEntry) {
    if (busy || !window.confirm(discardPrompt(entry.path, entry.kind))) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await tauriGit.discardPaths(path, [entry.path]);
      reload();
      if (selected?.path === entry.path) {
        onDiscarded();
      }
      await onRepositoryChanged();
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  function openMenu(entry: WorkingTreeEntry, event: MouseEvent) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, entry });
  }

  function menuItems(entry: WorkingTreeEntry): MenuItem[] {
    return [
      {
        id: "stage",
        label: entry.staged ? "Quitar del stage" : "Stage",
        disabled: busy,
        onSelect: () => {
          void move([entry.path], entry.staged);
        },
      },
      {
        id: "discard",
        label: "Descartar cambios",
        danger: true,
        disabled: busy,
        onSelect: () => {
          void discard(entry);
        },
      },
    ];
  }

  async function draftMessage() {
    if (busy || running || drafting) {
      return;
    }
    if (!entries.some((entry) => entry.staged)) {
      setActionError("Pasa archivos a stage antes de generar el mensaje.");
      return;
    }
    setDrafting(true);
    setActionError(null);
    try {
      const draft = await tauriGit.generateCommitMessage(path);
      setSummary(draft.summary);
      setDescription(draft.description);
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setDrafting(false);
    }
  }

  function confirmCommit() {
    const nextSummary = summary.trim();
    const nextDescription = description.trim();
    if (!nextSummary || busy || running || drafting) {
      return;
    }
    void runOperation(
      "other",
      "Confirmando",
      async () => {
        const author = authors.find((item) => item.email === authorEmail);
        await tauriGit.createCommit(
          path,
          nextSummary,
          nextDescription,
          author?.name ?? "",
          author?.email ?? "",
        );
        setSummary("");
        setDescription("");
      },
      onRepositoryChanged,
    );
  }

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">
          {loading && entries.length === 0
            ? "Leyendo cambios…"
            : refreshing
              ? "Actualizando cambios…"
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
          onOpenFile={onOpenFile}
          onOpenMenu={openMenu}
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
          onOpenFile={onOpenFile}
          onOpenMenu={openMenu}
          onMove={(filePaths) => {
            void move(filePaths, true);
          }}
        />
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.entry)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <form
        className="border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void confirmCommit();
        }}
      >
        <div className="relative mb-2">
          <input
            value={summary}
            disabled={busy || running || drafting}
            placeholder="Resumen del commit"
            onChange={(event) => setSummary(event.target.value)}
            className="w-full rounded border border-line bg-surface py-1.5 pr-9 pl-2 text-sm disabled:text-muted"
          />
          <button
            type="button"
            title={drafting ? "Generando el mensaje…" : "Generar mensaje"}
            aria-label="Generar mensaje"
            aria-busy={drafting}
            disabled={busy || running || drafting}
            onClick={() => {
              void draftMessage();
            }}
            className="absolute top-1/2 right-1 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-accent hover:bg-accent/10 disabled:text-muted"
          >
            <SparkleIcon className={drafting ? "animate-pulse" : ""} />
          </button>
        </div>
        <textarea
          value={description}
          disabled={busy || running || drafting}
          rows={3}
          placeholder="Descripción"
          onChange={(event) => setDescription(event.target.value)}
          className="mb-2 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-sm disabled:text-muted"
        />
        {authors.length > 0 ? (
          <label className="mb-2 block text-xs text-muted">
            Autor
            <select
              value={authorEmail}
              disabled={busy || running || drafting}
              aria-label="Autor del commit"
              onChange={(event) => setAuthorEmail(event.target.value)}
              className="mt-1 w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-text disabled:text-muted"
            >
              {authors.map((author) => (
                <option key={author.email} value={author.email}>
                  {`${author.name} <${author.email}>${author.current ? " · actual" : ""}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" disabled />
          Enmendar el commit anterior
        </label>
        <button
          type="submit"
          disabled={busy || running || drafting || summary.trim().length === 0}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-surface disabled:bg-accent/40"
        >
          Confirmar
        </button>
      </form>
      <StashSection
        path={path}
        revision={revision}
        disabled={busy || running}
        onRepositoryChanged={onRepositoryChanged}
      />
    </aside>
  );
}

function StashSection({
  path,
  revision,
  disabled,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  disabled: boolean;
  onRepositoryChanged: () => Promise<void>;
}) {
  const [entries, setEntries] = useState<StashEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const generation = revision;
    tauriGit
      .listStashes(path)
      .then((next) => {
        if (!cancelled && generation === revision) {
          setEntries(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled && generation === revision) {
          setError(toGitClientError(reason).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  async function run(action: () => Promise<void>) {
    if (working || disabled) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await action();
      await onRepositoryChanged();
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    } finally {
      setWorking(false);
    }
  }

  const locked = working || disabled;

  return (
    <section className="border-t border-line p-3">
      <p className="mb-2 text-xs text-muted">Stash</p>
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            void run(() => tauriGit.saveStash(path, "", false));
          }}
          className="rounded border border-line px-2 py-1 text-[11px] hover:bg-surface-overlay disabled:opacity-40"
        >
          Guardar cambios
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            void run(() => tauriGit.saveStash(path, "", true));
          }}
          className="rounded border border-line px-2 py-1 text-[11px] hover:bg-surface-overlay disabled:opacity-40"
        >
          Incluir archivos nuevos
        </button>
      </div>
      {error ? <p className="mb-2 text-[11px] text-warn">{error}</p> : null}
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted">No hay reservas.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {entries.map((entry) => (
            <li key={`${entry.index}-${entry.stashedAt}`} className="mb-2">
              <p className="truncate text-xs" title={entry.message}>
                {entry.message}
              </p>
              <p className="truncate text-[11px] text-muted">
                {entry.branch ?? "sin rama"} · {formatWhen(entry.stashedAt)}
              </p>
              <div className="mt-1 flex gap-2 text-[11px]">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    void run(() => tauriGit.applyStash(path, entry.index));
                  }}
                  className="text-accent disabled:opacity-40"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    void run(() => tauriGit.popStash(path, entry.index));
                  }}
                  className="text-accent disabled:opacity-40"
                >
                  Traer
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    void run(() => tauriGit.dropStash(path, entry.index));
                  }}
                  className="text-warn disabled:opacity-40"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-4 w-4 ${className ?? ""}`}
    >
      <path
        fill="currentColor"
        d="M8 1.2 9.15 6.05 14 8 9.15 9.95 8 14.8 6.85 9.95 2 8l4.85-1.95Z"
      />
    </svg>
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
  onOpenFile,
  onOpenMenu,
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
  onOpenFile: (file: string) => void;
  onOpenMenu: (entry: WorkingTreeEntry, event: MouseEvent) => void;
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
              onOpenFile={onOpenFile}
              onOpenMenu={onOpenMenu}
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
                        onOpenFile={onOpenFile}
                        onOpenMenu={onOpenMenu}
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
  onOpenFile,
  onOpenMenu,
  onMove,
}: {
  entry: WorkingTreeEntry;
  label: string;
  busy: boolean;
  indent?: boolean;
  selected: WorkFile | null;
  onSelect: (file: WorkFile) => void;
  onOpenFile: (file: string) => void;
  onOpenMenu: (entry: WorkingTreeEntry, event: MouseEvent) => void;
  onMove: (paths: string[]) => void;
}) {
  const active =
    selected?.path === entry.path && selected.staged === entry.staged;
  const slash = label.lastIndexOf("/");
  const dir = slash >= 0 ? label.slice(0, slash + 1) : "";
  const name = slash >= 0 ? label.slice(slash + 1) : label;
  return (
    <li
      className="flex items-center"
      onContextMenu={(event) => onOpenMenu(entry, event)}
    >
      <button
        type="button"
        title={`${entry.path} · doble clic para editar`}
        onClick={() => onSelect({ path: entry.path, staged: entry.staged })}
        onDoubleClick={() => onOpenFile(entry.path)}
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
