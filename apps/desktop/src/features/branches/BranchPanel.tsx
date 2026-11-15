import type { BranchRef } from "@githydra/contracts";
import { useState } from "react";
import { useBranches } from "../../hooks/useBranches";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";

export function BranchPanel({
  path,
  revision,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  onRepositoryChanged: () => Promise<void>;
}) {
  const { branches, error, loading } = useBranches(path, revision);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const local = branches.filter((branch) => branch.remote === null);
  const remoteNames = [
    ...new Set(
      branches.flatMap((branch) => (branch.remote ? [branch.remote] : [])),
    ),
  ];

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
    <aside className="flex h-full flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase">
        Ramas
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {loading && branches.length === 0 ? (
          <p className="px-2 text-xs text-muted">Cargando…</p>
        ) : null}
        {error ? <p className="px-2 text-xs text-warn">{error}</p> : null}
        {actionError ? (
          <p className="px-2 text-xs text-warn">{actionError}</p>
        ) : null}
        <BranchGroup
          title="Local"
          branches={local}
          busy={busy}
          draft={name}
          onDraft={setName}
          onCreate={() => {
            const nextName = name.trim();
            if (!nextName) {
              return;
            }
            void run(async () => {
              await tauriGit.createBranch(path, nextName);
              setName("");
            });
          }}
          onCheckout={(branch) => {
            void run(() => tauriGit.checkoutBranch(path, branch.name));
          }}
          onDelete={(branch) => {
            if (!window.confirm(`¿Borrar la rama ${branch.name}?`)) {
              return;
            }
            void run(() => tauriGit.deleteBranch(path, branch.name));
          }}
        />
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
  busy = false,
  draft,
  onDraft,
  onCreate,
  onCheckout,
  onDelete,
}: {
  title: string;
  branches: BranchRef[];
  busy?: boolean;
  draft?: string;
  onDraft?: (value: string) => void;
  onCreate?: () => void;
  onCheckout?: (branch: BranchRef) => void;
  onDelete?: (branch: BranchRef) => void;
}) {
  return (
    <section className="mb-3">
      <h2 className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {onCreate ? (
        <form
          className="mb-2 flex gap-1 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <input
            value={draft ?? ""}
            disabled={busy}
            placeholder="Nueva rama"
            onChange={(event) => onDraft?.(event.target.value)}
            className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={busy || (draft ?? "").trim().length === 0}
            className="rounded px-2 py-1 text-xs text-accent disabled:text-muted"
          >
            Crear
          </button>
        </form>
      ) : null}
      {branches.length === 0 ? (
        <p className="px-2 text-xs text-muted">Sin ramas</p>
      ) : (
        <ul>
          {branches.map((branch) => (
            <li
              key={`${branch.remote ?? "local"}:${branch.name}`}
              className="flex items-center gap-1"
            >
              {onCheckout ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCheckout(branch)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm disabled:opacity-60 ${
                    branch.isHead ? "bg-accent-dim text-accent" : "text-text"
                  }`}
                >
                  <BranchMark head={branch.isHead} />
                  <span className="truncate">{branch.name}</span>
                </button>
              ) : (
                <div
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-sm ${
                    branch.isHead ? "bg-accent-dim text-accent" : "text-text"
                  }`}
                >
                  <BranchMark head={branch.isHead} />
                  <span className="truncate">{branch.name}</span>
                </div>
              )}
              {onDelete && !branch.isHead ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(branch)}
                  className="px-1 text-[11px] text-muted hover:text-warn disabled:opacity-60"
                >
                  Borrar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BranchMark({ head }: { head: boolean }) {
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${head ? "bg-accent" : "bg-graph-edge"}`}
    />
  );
}
