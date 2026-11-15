import type { BranchRef, CommitSummary } from "@githydra/contracts";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useBranches } from "../../hooks/useBranches";
import { useCommitLog } from "../../hooks/useCommitLog";
import { formatWhen, subjectOf } from "../../lib/format";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { CommitGraph } from "../graph/GraphPanel";
import { GRAPH_ROW_HEIGHT } from "../graph/layout";

export function HistoryPanel({
  path,
  revision,
  selectedSha,
  onSelect,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  selectedSha: string | null;
  onSelect: (sha: string) => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  const { commits, cursor, loading, error, loadMore } = useCommitLog(
    path,
    revision,
  );
  const { branches } = useBranches(path, revision);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openCommit(sha: string, event: MouseEvent) {
    const commit = commits.find((item) => item.sha === sha);
    if (!commit) {
      return;
    }
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: commitItems(commit),
    });
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        Historial
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
        {actionError ? (
          <p className="px-3 py-2 text-xs text-warn">{actionError}</p>
        ) : null}
        <div className="flex min-w-0">
          {commits.length > 0 ? (
            <CommitGraph
              commits={commits}
              selectedSha={selectedSha}
              onOpen={openCommit}
            />
          ) : null}
          <ul className="min-w-0 flex-1">
            {commits.map((commit) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                branches={branches}
                selected={commit.sha === selectedSha}
                onOpen={openCommit}
              />
            ))}
          </ul>
        </div>
        {loading && commits.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">Cargando…</p>
        ) : null}
        {!loading && commits.length === 0 && !error ? (
          <p className="px-3 py-2 text-xs text-muted">
            Este repositorio todavía no tiene commits.
          </p>
        ) : null}
        {cursor ? (
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => {
                void loadMore();
              }}
              disabled={loading}
              className="text-xs text-accent hover:underline disabled:text-muted"
            >
              {loading ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        ) : null}
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );

  function commitItems(commit: CommitSummary): MenuItem[] {
    return [
      {
        id: "diff",
        label: "Ver cambios",
        onSelect: () => onSelect(commit.sha),
      },
      {
        id: "copy",
        label: "Copiar sha",
        onSelect: () => {
          void navigator.clipboard.writeText(commit.sha);
        },
      },
      {
        id: "branch",
        label: "Crear rama aquí",
        onSelect: () => {
          const nextName = window.prompt("Nombre de la nueva rama");
          if (!nextName) {
            return;
          }
          void tauriGit
            .createBranchAt(path, nextName, commit.sha)
            .then(() => onRepositoryChanged())
            .catch((reason: unknown) => {
              setActionError(toGitClientError(reason).message);
            });
        },
      },
    ];
  }
}

function CommitRow({
  commit,
  branches,
  selected,
  onOpen,
}: {
  commit: CommitSummary;
  branches: BranchRef[];
  selected: boolean;
  onOpen: (sha: string, event: MouseEvent) => void;
}) {
  const tips = branches.filter((branch) => branch.tipSha === commit.sha);
  return (
    <li className="border-b border-line/70">
      <button
        type="button"
        onClick={(event) => onOpen(commit.sha, event)}
        style={{ height: GRAPH_ROW_HEIGHT }}
        className={`flex w-full flex-col justify-center overflow-hidden px-3 text-left ${selected ? "bg-accent-dim" : "hover:bg-surface-overlay"}`}
      >
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 truncate text-xs" title={commit.message}>
            {subjectOf(commit.message)}
          </p>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {commit.shortSha}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>
            {commit.authorName || "desconocido"} ·{" "}
            {formatWhen(commit.authoredAt)}
          </span>
          {tips.map((branch) => (
            <span
              key={`${branch.remote ?? "local"}:${branch.name}`}
              className={`rounded px-1.5 py-0.5 font-medium ${
                branch.isHead
                  ? "bg-accent-dim text-accent"
                  : "bg-surface-overlay text-graph-edge"
              }`}
            >
              {branch.name}
            </span>
          ))}
        </div>
      </button>
    </li>
  );
}
