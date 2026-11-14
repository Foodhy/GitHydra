import type { BranchRef } from "@githydra/contracts";
import { useBranches } from "../../hooks/useBranches";

export function BranchPanel({ path }: { path: string }) {
  const { branches, error, loading } = useBranches(path);
  const local = branches.filter((branch) => branch.remote === null);
  const remoteNames = [
    ...new Set(
      branches.flatMap((branch) => (branch.remote ? [branch.remote] : [])),
    ),
  ];

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        Ramas
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {loading && branches.length === 0 ? (
          <p className="px-2 text-xs text-muted">Cargando…</p>
        ) : null}
        {error ? <p className="px-2 text-xs text-warn">{error}</p> : null}
        <BranchGroup title="Local" branches={local} />
        {remoteNames.map((remote) => (
          <BranchGroup
            key={remote}
            title={remote}
            branches={branches.filter((branch) => branch.remote === remote)}
          />
        ))}
        {remoteNames.length === 0 ? (
          <BranchGroup title="Remotes" branches={[]} />
        ) : null}
      </div>
    </aside>
  );
}

function BranchGroup({
  title,
  branches,
}: {
  title: string;
  branches: BranchRef[];
}) {
  return (
    <section className="mb-3">
      <h2 className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {branches.length === 0 ? (
        <p className="px-2 text-xs text-muted">Sin ramas</p>
      ) : (
        <ul>
          {branches.map((branch) => (
            <li key={`${branch.remote ?? "local"}:${branch.name}`}>
              <div
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                  branch.isHead ? "bg-accent-dim text-accent" : "text-text"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${branch.isHead ? "bg-accent" : "bg-graph-edge"}`}
                />
                <span className="truncate">{branch.name}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
