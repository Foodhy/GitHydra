import type { LinkedWorktree } from "@githydra/contracts";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { toGitClientError } from "../../lib/git/errors";
import { translateGitMessage } from "../../lib/git/git-text";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { getLocale, t, useT } from "../../lib/i18n";
import { adoptRepository } from "../../lib/repo-actions";
import { type OperationKind, runOperation } from "../../lib/run-operation";

export function WorktreeList({
  path,
  worktrees,
  error,
  running,
  onRepositoryChanged,
}: {
  path: string;
  worktrees: LinkedWorktree[];
  error: string | null;
  running: boolean;
  onRepositoryChanged: () => Promise<void>;
}) {
  const tr = useT();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  function run(
    kind: OperationKind,
    label: string,
    action: () => Promise<void>,
  ) {
    void runOperation(kind, label, action, onRepositoryChanged);
  }

  function openMenu(copy: LinkedWorktree, event: MouseEvent) {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: copyItems(copy),
    });
  }

  function copyItems(copy: LinkedWorktree): MenuItem[] {
    const items: MenuItem[] = [
      {
        id: "open",
        label: tr("worktree.open"),
        disabled: copy.missing || copy.isCurrent || running,
        onSelect: () => {
          run("other", tr("worktree.opening"), async () => {
            const repo = await tauriGit.openRepository(copy.path);
            await adoptRepository(repo);
          });
        },
      },
      {
        id: "reveal",
        label: tr("worktree.reveal"),
        disabled: copy.missing || running,
        onSelect: () => {
          void revealItemInDir(copy.path);
        },
      },
    ];
    if (copy.locked && copy.missing) {
      items.push({
        id: "unlock-prune",
        label: tr("worktree.unlockPrune"),
        disabled: running,
        onSelect: () => {
          if (!window.confirm(tr("worktree.confirmUnlock"))) {
            return;
          }
          run("other", tr("worktree.freeing"), async () => {
            await tauriGit.unlockWorktree(path, copy.path);
            await tauriGit.pruneWorktrees(path);
          });
        },
      });
    } else if (copy.locked) {
      items.push({
        id: "unlock",
        label: tr("worktree.unlock"),
        disabled: running,
        onSelect: () => {
          run("other", tr("worktree.unlocking"), () =>
            tauriGit.unlockWorktree(path, copy.path),
          );
        },
      });
    }
    if (!copy.isMain && !copy.missing) {
      items.push({
        id: "remove",
        label: tr("worktree.remove"),
        danger: true,
        disabled: running || copy.locked,
        onSelect: () => {
          const branch = copy.branch ?? tr("stash.noBranch");
          if (
            !window.confirm(
              tr("worktree.confirmRemove", { path: copy.path, branch }),
            )
          ) {
            return;
          }
          run("other", tr("worktree.removing"), async () => {
            try {
              await tauriGit.removeWorktree(path, copy.path, false);
            } catch (reason: unknown) {
              const message = toGitClientError(reason).message;
              if (
                (message.includes("Confirm again") ||
                  message.includes("Confirma otra vez")) &&
                window.confirm(message)
              ) {
                await tauriGit.removeWorktree(path, copy.path, true);
                return;
              }
              throw reason;
            }
          });
        },
      });
    }
    return items;
  }

  return (
    <section className="mt-2 border-t border-line pt-1">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="min-w-0 flex-1 text-[11px] text-muted">
          {tr("worktree.copies")}
        </span>
        <button
          type="button"
          disabled={running}
          onClick={() => {
            run("other", tr("worktree.pruning"), () =>
              tauriGit.pruneWorktrees(path),
            );
          }}
          className="text-[11px] text-accent disabled:text-muted"
        >
          {tr("worktree.prune")}
        </button>
      </div>
      {error ? <p className="px-3 text-xs text-warn">{error}</p> : null}
      <ul>
        {worktrees.map((copy) => (
          <li key={copy.path}>
            <button
              type="button"
              title={translateGitMessage(copy.situation, getLocale())}
              onClick={(event) => openMenu(copy, event)}
              onContextMenu={(event) => openMenu(copy, event)}
              className={`flex w-full flex-col gap-0.5 px-3 py-1 text-left hover:bg-surface-overlay ${
                copy.isCurrent ? "text-accent" : "text-text"
              }`}
            >
              <span className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {copyLabel(copy)}
                </span>
                <span className="max-w-[45%] truncate font-mono text-[10px] text-muted">
                  {shortPath(copy.path)}
                </span>
              </span>
              <span className="text-[11px] leading-4 text-muted">
                {translateGitMessage(copy.situation, getLocale())}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </section>
  );
}

function copyLabel(copy: LinkedWorktree): string {
  if (copy.isDetached) {
    return `HEAD ${copy.headSha?.slice(0, 7) ?? ""}`.trim();
  }
  if (copy.branch) {
    return copy.branch;
  }
  return copy.isMain ? t("worktree.principal") : t("worktree.copy");
}

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}
