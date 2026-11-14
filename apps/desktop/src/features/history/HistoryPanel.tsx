import type { BranchRef, CommitSummary } from "@githydra/contracts";
import { useBranches } from "../../hooks/useBranches";
import { useCommitLog } from "../../hooks/useCommitLog";
import { formatWhen, subjectOf } from "../../lib/format";

export function HistoryPanel({ path }: { path: string }) {
  const { commits, cursor, loading, error, loadMore } = useCommitLog(path);
  const { branches } = useBranches(path);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        Historial
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
        <ul>
          {commits.map((commit) => (
            <CommitRow key={commit.sha} commit={commit} branches={branches} />
          ))}
        </ul>
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
    </div>
  );
}

function CommitRow({
  commit,
  branches,
}: {
  commit: CommitSummary;
  branches: BranchRef[];
}) {
  const tips = branches.filter((branch) => branch.tipSha === commit.sha);
  return (
    <li className="border-b border-line/70 px-3 py-2">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 truncate text-sm" title={commit.message}>
          {subjectOf(commit.message)}
        </p>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {commit.shortSha}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          {commit.authorName || "desconocido"} · {formatWhen(commit.authoredAt)}
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
    </li>
  );
}
