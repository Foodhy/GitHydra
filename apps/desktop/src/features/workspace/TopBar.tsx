import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  FolderGit2,
  GitBranch,
  Redo2,
  Settings,
  SquareTerminal,
  Undo2,
} from "lucide-react";
import { ToolButton } from "../../components/ToolButton";
import { useAppVersion } from "../../hooks/useAppVersion";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { showRepoManagement } from "../../lib/repo-actions";
import {
  canCancel,
  cancelOperation,
  runOperation,
} from "../../lib/run-operation";
import { operationStatus, useOperation } from "../../stores/operation";
import { useRepoSession } from "../../stores/repo-session";
import { LayoutMenu } from "./LayoutMenu";
import type { LayoutNode } from "./layout-tree";

export function TopBar({
  path,
  layout,
  onApplyLayout,
  onRepositoryChanged,
}: {
  path: string;
  layout: LayoutNode;
  onApplyLayout: (tree: LayoutNode) => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  const info = useRepoSession((state) => state.info);
  const version = useAppVersion();
  const operation = useOperation();
  const branch = info?.isDetached
    ? "HEAD suelto"
    : (info?.currentBranch ?? "sin rama");
  const status = operationStatus(branch, operation);

  function run(
    kind: "fetch" | "pull" | "push",
    label: string,
    action: () => Promise<void>,
  ) {
    void runOperation(kind, label, action, onRepositoryChanged);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3">
      <Link
        to="/"
        onClick={() => showRepoManagement()}
        className="rounded p-1 text-accent"
        title="Repos"
      >
        <FolderGit2 size={18} />
      </Link>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {info?.name ?? "GitHydra"}
        </p>
        <p
          className={`flex min-w-0 items-center gap-2 truncate text-[11px] ${status.warn ? "text-warn" : "text-muted"}`}
          title={status.text}
        >
          <span className="truncate">{status.text}</span>
          {operation.running && canCancel(operation.kind) ? (
            <button
              type="button"
              onClick={() => {
                void cancelOperation();
              }}
              className="shrink-0 text-accent"
            >
              Cancelar
            </button>
          ) : null}
        </p>
      </div>
      <div className="mx-auto flex items-center gap-0.5">
        <ToolButton label="Deshacer">
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton label="Rehacer">
          <Redo2 size={16} />
        </ToolButton>
        <ToolButton
          label="Fetch"
          busy={operation.running && operation.kind === "fetch"}
          disabled={operation.running && operation.kind !== "fetch"}
          onClick={() => {
            run("fetch", "Fetch", () => tauriGit.fetch(path));
          }}
        >
          <CloudDownload size={16} />
        </ToolButton>
        <ToolButton
          label="Pull"
          busy={operation.running && operation.kind === "pull"}
          disabled={operation.running && operation.kind !== "pull"}
          onClick={() => {
            run("pull", "Pull", () => tauriGit.pull(path));
          }}
        >
          <ArrowDownToLine size={16} />
        </ToolButton>
        <ToolButton
          label="Push"
          busy={operation.running && operation.kind === "push"}
          disabled={operation.running && operation.kind !== "push"}
          onClick={() => {
            run("push", "Push", () => tauriGit.push(path));
          }}
        >
          <ArrowUpFromLine size={16} />
        </ToolButton>
        <ToolButton label="Branch">
          <GitBranch size={16} />
        </ToolButton>
        <ToolButton label="Stash">
          <Archive size={16} />
        </ToolButton>
        <ToolButton label="Terminal">
          <SquareTerminal size={16} />
        </ToolButton>
      </div>
      <LayoutMenu tree={layout} onApply={onApplyLayout} />
      <Link
        to="/settings"
        className="rounded-md p-1.5 text-muted hover:bg-surface-overlay hover:text-text"
        title="Preferencias"
      >
        <Settings size={16} />
        <span className="sr-only">Preferencias</span>
      </Link>
      <span className="font-mono text-[11px] text-muted">v{version}</span>
    </header>
  );
}
