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
import { useState } from "react";
import { ToolButton } from "../../components/ToolButton";
import { useAppVersion } from "../../hooks/useAppVersion";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { useRepoSession } from "../../stores/repo-session";

export function TopBar({
  path,
  onRepositoryChanged,
}: {
  path: string;
  onRepositoryChanged: () => Promise<void>;
}) {
  const info = useRepoSession((state) => state.info);
  const version = useAppVersion();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const branch = info?.isDetached
    ? "HEAD suelto"
    : (info?.currentBranch ?? "sin rama");

  async function run(action: () => Promise<void>) {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await onRepositoryChanged();
    } catch (reason: unknown) {
      setActionError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3">
      <Link to="/" className="rounded p-1 text-accent" title="Repos">
        <FolderGit2 size={18} />
      </Link>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {info?.name ?? "GitHydra"}
        </p>
        <p
          className={`truncate text-[11px] ${actionError ? "text-warn" : "text-muted"}`}
          title={actionError ?? undefined}
        >
          {actionError ?? branch}
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
          disabled={busy}
          onClick={() => {
            void run(() => tauriGit.fetch(path));
          }}
        >
          <CloudDownload size={16} />
        </ToolButton>
        <ToolButton
          label="Pull"
          disabled={busy}
          onClick={() => {
            void run(() => tauriGit.pull(path));
          }}
        >
          <ArrowDownToLine size={16} />
        </ToolButton>
        <ToolButton
          label="Push"
          disabled={busy}
          onClick={() => {
            void run(() => tauriGit.push(path));
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
