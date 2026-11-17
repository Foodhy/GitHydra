import type { BranchRef, CommitSummary } from "@githydra/contracts";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useBranches } from "../../hooks/useBranches";
import { useCommitLog } from "../../hooks/useCommitLog";
import { formatWhen, subjectOf } from "../../lib/format";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { useT } from "../../lib/i18n";
import { runOperation } from "../../lib/run-operation";
import {
  AddWorktreeDialog,
  type WorktreeSeed,
} from "../branches/AddWorktreeDialog";
import { branchColor } from "../graph/colors";
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
  const { commits, cursor, loading, refreshing, error, loadMore } =
    useCommitLog(path, revision);
  const { branches } = useBranches(path, revision);
  const tr = useT();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const [worktreeSeed, setWorktreeSeed] = useState<WorktreeSeed | null>(null);

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
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
        {refreshing ? (
          <p className="px-3 py-1 text-[11px] text-muted">
            {tr("history.updating")}
          </p>
        ) : null}
        <div className="flex min-w-0">
          {commits.length > 0 ? (
            <CommitGraph
              commits={commits}
              branches={branches}
              selectedSha={selectedSha}
              onSelect={onSelect}
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
                onSelect={onSelect}
                onOpen={openCommit}
              />
            ))}
          </ul>
        </div>
        {loading && commits.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">
            {tr("history.loading")}
          </p>
        ) : null}
        {!loading && commits.length === 0 && !error ? (
          <p className="px-3 py-2 text-xs text-muted">{tr("history.empty")}</p>
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
              {loading ? tr("history.loading") : tr("history.more")}
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
      {worktreeSeed ? (
        <AddWorktreeDialog
          path={path}
          seed={worktreeSeed}
          onClose={() => setWorktreeSeed(null)}
          onRepositoryChanged={onRepositoryChanged}
        />
      ) : null}
    </div>
  );

  function commitItems(commit: CommitSummary): MenuItem[] {
    return [
      {
        id: "diff",
        label: tr("history.view"),
        onSelect: () => onSelect(commit.sha),
      },
      {
        id: "copy",
        label: tr("history.copySha"),
        onSelect: () => {
          void navigator.clipboard.writeText(commit.sha);
        },
      },
      {
        id: "checkout",
        label: tr("history.checkout"),
        onSelect: () => {
          if (!window.confirm(tr("history.confirmDetach"))) {
            return;
          }
          void runOperation(
            "checkout",
            tr("history.checkingOut"),
            () => tauriGit.checkoutCommit(path, commit.sha),
            onRepositoryChanged,
          );
        },
      },
      {
        id: "tag",
        label: tr("history.tag"),
        onSelect: () => {
          const tagName = window.prompt(tr("history.askTag"));
          if (!tagName) {
            return;
          }
          const message = window.prompt(tr("history.askTagMessage"), "");
          if (message === null) {
            return;
          }
          void runOperation(
            "other",
            tr("history.creatingTag"),
            () => tauriGit.createTag(path, commit.sha, tagName, message),
            onRepositoryChanged,
          );
        },
      },
      {
        id: "worktree",
        label: tr("branch.worktree"),
        onSelect: () => {
          setWorktreeSeed({
            branch: "",
            sha: commit.sha,
            createBranch: true,
          });
        },
      },
      {
        id: "branch",
        label: tr("branch.createHere"),
        onSelect: () => {
          const nextName = window.prompt(tr("branch.askName"));
          if (!nextName) {
            return;
          }
          void runOperation(
            "other",
            tr("branch.creating"),
            () => tauriGit.createBranchAt(path, nextName, commit.sha),
            onRepositoryChanged,
          );
        },
      },
    ];
  }
}

function BranchPills({ tips }: { tips: BranchRef[] }) {
  const shown = [...tips].sort(
    (left, right) => Number(right.isHead) - Number(left.isHead),
  );
  const visible = shown.slice(0, 3);
  const extra = shown.length - visible.length;
  if (visible.length === 0) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {visible.map((branch) => {
        const color = branchColor(branch.name, branch.isHead);
        return (
          <span
            key={`${branch.remote ?? "local"}:${branch.name}`}
            title={branch.name}
            className="inline-flex max-w-36 items-center gap-1 truncate rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium"
            style={{ color }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="truncate">{branch.name}</span>
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="text-[10px] text-muted">+{extra}</span>
      ) : null}
    </span>
  );
}

function CommitRow({
  commit,
  branches,
  selected,
  onSelect,
  onOpen,
}: {
  commit: CommitSummary;
  branches: BranchRef[];
  selected: boolean;
  onSelect: (sha: string) => void;
  onOpen: (sha: string, event: MouseEvent) => void;
}) {
  const tips = branches.filter((branch) => branch.tipSha === commit.sha);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(commit.sha)}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpen(commit.sha, event);
        }}
        style={{ height: GRAPH_ROW_HEIGHT }}
        className={`box-border flex w-full items-center gap-2 overflow-hidden border-b border-line/70 px-3 text-left ${
          selected
            ? "bg-accent-dim shadow-[inset_2px_0_0_var(--color-accent)]"
            : "hover:bg-surface-overlay"
        }`}
      >
        <p className="min-w-0 flex-1 truncate text-xs" title={commit.message}>
          {subjectOf(commit.message)}
        </p>
        <BranchPills tips={tips} />
        <span className="max-w-40 shrink-0 truncate text-[11px] text-muted">
          {commit.authorName || "desconocido"} · {formatWhen(commit.authoredAt)}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {commit.shortSha}
        </span>
      </button>
    </li>
  );
}
