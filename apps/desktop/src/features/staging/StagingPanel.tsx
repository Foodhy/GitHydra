import type {
  CommitAuthor,
  CommitMessageCandidate,
  StashEntry,
  WorkingTreeEntry,
} from "@githydra/contracts";
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useWorkingTree } from "../../hooks/useWorkingTree";
import {
  type CommitAi,
  commitAgentLabel,
  readCommitAi,
} from "../../lib/commit-ai";
import { discardPrompt } from "../../lib/discard-prompt";
import { formatWhen } from "../../lib/format";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { t, useT } from "../../lib/i18n";
import { runOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import type { WorkFile } from "../diff/WorkDiffPanel";

const COMMIT_HEIGHT_KEY = "githydra.stageCommitHeight";

function readCommitHeight(): number {
  const saved = Number(localStorage.getItem(COMMIT_HEIGHT_KEY));
  if (!Number.isFinite(saved)) {
    return 240;
  }
  return Math.min(560, Math.max(120, saved));
}

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
  const [proposed, setProposed] = useState(false);
  const touched = useRef(false);
  const tr = useT();
  const [drafting, setDrafting] = useState(false);
  const [candidates, setCandidates] = useState<CommitMessageCandidate[]>([]);
  const [ai, setAi] = useState<CommitAi>({
    enabled: true,
    providers: ["cursor"],
  });
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
  useEffect(() => {
    let alive = true;
    void tauriGit
      .readCommitProposal(path)
      .then((proposal) => {
        if (!alive || revision < 0 || !proposal || touched.current) {
          return;
        }
        setSummary((current) => (current.trim() ? current : proposal.summary));
        setDescription((current) =>
          current.trim() ? current : proposal.description,
        );
        setProposed(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path, revision]);
  useEffect(() => {
    let alive = true;
    readCommitAi()
      .then((next) => {
        if (alive) {
          setAi(next);
        }
      })
      .catch(() => {
        if (alive) {
          setAi({ enabled: true, providers: ["cursor"] });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

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
        label: entry.staged ? tr("stage.unstage") : tr("stage.stage"),
        disabled: busy,
        onSelect: () => {
          void move([entry.path], entry.staged);
        },
      },
      {
        id: "discard",
        label: tr("stage.discard"),
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
      setActionError(tr("stage.needStage"));
      return;
    }
    if (!ai.enabled || ai.providers.length === 0) {
      setActionError(tr("stage.needProvider"));
      return;
    }
    setDrafting(true);
    setActionError(null);
    setCandidates([]);
    try {
      const drafts = await tauriGit.generateCommitMessage(path, ai.providers);
      const ready = drafts.filter(
        (item) => !item.error && item.summary.trim().length > 0,
      );
      if (ready.length === 1) {
        const [draft] = ready;
        setSummary(draft.summary);
        setDescription(draft.description);
        setCandidates(drafts.filter((item) => item.error));
      } else {
        setCandidates(drafts);
      }
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
      tr("stage.confirming"),
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
        setProposed(false);
        touched.current = false;
      },
      onRepositoryChanged,
    );
  }

  const asideRef = useRef<HTMLElement>(null);
  const [commitHeight, setCommitHeight] = useState(readCommitHeight);

  function resizeCommit(event: ReactPointerEvent<HTMLHRElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const start = commitHeight;
    const parent = asideRef.current?.getBoundingClientRect().height ?? 640;
    const ceiling = Math.max(160, parent - 96);
    const move = (next: PointerEvent) => {
      const height = start - (next.clientY - startY);
      setCommitHeight(Math.min(ceiling, Math.max(120, height)));
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      setCommitHeight((current) => {
        localStorage.setItem(COMMIT_HEIGHT_KEY, String(current));
        return current;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function nudgeCommit(delta: number) {
    const parent = asideRef.current?.getBoundingClientRect().height ?? 640;
    const ceiling = Math.max(160, parent - 96);
    setCommitHeight((current) => {
      const next = Math.min(ceiling, Math.max(120, current + delta));
      localStorage.setItem(COMMIT_HEIGHT_KEY, String(next));
      return next;
    });
  }

  return (
    <aside ref={asideRef} className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">
          {loading && entries.length === 0
            ? tr("stage.reading")
            : refreshing
              ? tr("stage.updating")
              : tr(entries.length === 1 ? "stage.count" : "stage.countPlural", {
                  count: entries.length,
                })}
        </p>
        <input
          value={query}
          placeholder={tr("stage.filter")}
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
          title={tr("stage.unstaged")}
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
          title={tr("stage.staged")}
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
      <hr
        aria-orientation="horizontal"
        aria-label={tr("stage.resize")}
        aria-valuenow={commitHeight}
        aria-valuemin={120}
        aria-valuemax={560}
        tabIndex={0}
        onPointerDown={resizeCommit}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            nudgeCommit(24);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            nudgeCommit(-24);
          }
        }}
        className="h-1.5 shrink-0 cursor-row-resize border-y border-line bg-surface hover:bg-accent/40"
      />
      <div
        className="flex min-h-0 shrink-0 flex-col overflow-auto"
        style={{ height: commitHeight, maxHeight: "70%" }}
      >
        <form
          className="border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmCommit();
          }}
        >
          {candidates.length > 0 ? (
            <div className="mb-2 grid gap-1">
              {candidates.map((candidate) =>
                candidate.error ? (
                  <p key={candidate.provider} className="text-xs text-warn">
                    {commitAgentLabel(candidate.provider)}: {candidate.error}
                  </p>
                ) : (
                  <button
                    key={candidate.provider}
                    type="button"
                    onClick={() => {
                      setSummary(candidate.summary);
                      setDescription(candidate.description);
                    }}
                    className="rounded border border-line px-2 py-1 text-left hover:bg-surface"
                  >
                    <span className="block text-[11px] text-muted">
                      {commitAgentLabel(candidate.provider)}
                    </span>
                    <span className="block truncate text-xs">
                      {candidate.summary}
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : null}
          {proposed ? (
            <p className="mb-2 text-xs text-muted">{tr("stage.proposed")}</p>
          ) : null}
          <div className="relative mb-2">
            <input
              value={summary}
              disabled={busy || running || drafting}
              placeholder={tr("stage.summary")}
              onChange={(event) => {
                touched.current = true;
                setProposed(false);
                setSummary(event.target.value);
              }}
              className={`w-full rounded border border-line bg-surface py-1.5 pl-2 text-sm disabled:text-muted ${ai.enabled ? "pr-9" : "pr-2"}`}
            />
            {ai.enabled ? (
              <button
                type="button"
                title={drafting ? tr("stage.generating") : tr("stage.generate")}
                aria-label={tr("stage.generate")}
                aria-busy={drafting}
                disabled={busy || running || drafting}
                onClick={() => {
                  void draftMessage();
                }}
                className="absolute top-1/2 right-1 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-accent hover:bg-accent/10 disabled:text-muted"
              >
                <SparkleIcon className={drafting ? "animate-pulse" : ""} />
              </button>
            ) : null}
          </div>
          <textarea
            value={description}
            disabled={busy || running || drafting}
            rows={3}
            placeholder={tr("stage.description")}
            onChange={(event) => {
              touched.current = true;
              setProposed(false);
              setDescription(event.target.value);
            }}
            className="mb-2 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-sm disabled:text-muted"
          />
          {authors.length > 0 ? (
            <label className="mb-2 block text-xs text-muted">
              {tr("stage.author")}
              <select
                value={authorEmail}
                disabled={busy || running || drafting}
                aria-label={tr("stage.authorLabel")}
                onChange={(event) => setAuthorEmail(event.target.value)}
                className="mt-1 w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-text disabled:text-muted"
              >
                {authors.map((author) => (
                  <option key={author.email} value={author.email}>
                    {`${author.name} <${author.email}>${author.current ? ` · ${tr("stage.currentAuthor")}` : ""}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mb-2 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" disabled />
            {tr("stage.amend")}
          </label>
          <button
            type="submit"
            disabled={
              busy || running || drafting || summary.trim().length === 0
            }
            className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-surface disabled:bg-accent/40"
          >
            {tr("stage.confirm")}
          </button>
        </form>
        <StashSection
          path={path}
          revision={revision}
          disabled={busy || running}
          onRepositoryChanged={onRepositoryChanged}
        />
      </div>
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
  const tr = useT();

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
          {tr("stash.save")}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            void run(() => tauriGit.saveStash(path, "", true));
          }}
          className="rounded border border-line px-2 py-1 text-[11px] hover:bg-surface-overlay disabled:opacity-40"
        >
          {tr("stash.saveUntracked")}
        </button>
      </div>
      {error ? <p className="mb-2 text-[11px] text-warn">{error}</p> : null}
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted">{tr("stash.empty")}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {entries.map((entry) => (
            <li key={`${entry.index}-${entry.stashedAt}`} className="mb-2">
              <p className="truncate text-xs" title={entry.message}>
                {entry.message}
              </p>
              <p className="truncate text-[11px] text-muted">
                {entry.branch ?? tr("stash.noBranch")} ·{" "}
                {formatWhen(entry.stashedAt)}
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
                  {tr("stash.apply")}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    void run(() => tauriGit.popStash(path, entry.index));
                  }}
                  className="text-accent disabled:opacity-40"
                >
                  {tr("stash.pop")}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    void run(() => tauriGit.dropStash(path, entry.index));
                  }}
                  className="text-warn disabled:opacity-40"
                >
                  {tr("stash.drop")}
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
  useT();
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
        <p className="px-3 pb-2 text-xs text-muted">{t("empty.group")}</p>
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
  const tr = useT();
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
        {entry.staged ? tr("stage.unstage") : tr("stage.stage")}
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
