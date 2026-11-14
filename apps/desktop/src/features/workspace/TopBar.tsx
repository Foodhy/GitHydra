import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderGit2,
  GitBranch,
  Redo2,
  SquareTerminal,
  Undo2,
} from "lucide-react";
import { ToolButton } from "../../components/ToolButton";
import { useAppVersion } from "../../hooks/useAppVersion";
import { useRepoSession } from "../../stores/repo-session";

export function TopBar() {
  const info = useRepoSession((state) => state.info);
  const version = useAppVersion();
  const branch = info?.isDetached
    ? "HEAD suelto"
    : (info?.currentBranch ?? "sin rama");

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3">
      <Link to="/" className="rounded p-1 text-accent" title="Repos">
        <FolderGit2 size={18} />
      </Link>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {info?.name ?? "GitHydra"}
        </p>
        <p className="truncate text-[11px] text-muted">{branch}</p>
      </div>
      <div className="mx-auto flex items-center gap-0.5">
        <ToolButton label="Deshacer">
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton label="Rehacer">
          <Redo2 size={16} />
        </ToolButton>
        <ToolButton label="Pull">
          <ArrowDownToLine size={16} />
        </ToolButton>
        <ToolButton label="Push">
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
      <span className="font-mono text-[11px] text-muted">v{version}</span>
    </header>
  );
}
