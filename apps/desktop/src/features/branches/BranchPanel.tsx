import type { BranchRef } from "@githydra/contracts";
import { GitBranch, Plus } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
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
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = branches.filter((branch) =>
    shortName(branch).toLowerCase().includes(needle),
  );
  const local = visible
    .filter((branch) => branch.remote === null)
    .sort(
      (left, right) =>
        Number(right.isHead) - Number(left.isHead) ||
        shortName(left).localeCompare(shortName(right)),
    );
  const remoteNames = [
    ...new Set(
      visible.flatMap((branch) => (branch.remote ? [branch.remote] : [])),
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

  function openMenu(branch: BranchRef, event: MouseEvent) {
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: branchItems(branch),
    });
  }

  return (
    <aside className="flex h-full flex-col bg-surface-raised">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <input
          value={query}
          placeholder="Filtrar ramas"
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted"
        />
        <button
          type="button"
          title="Nueva rama"
          aria-label="Nueva rama"
          onClick={() => setCreating((open) => !open)}
          className="rounded p-1 text-muted hover:bg-surface-overlay hover:text-text"
        >
          <Plus size={14} />
        </button>
      </div>
      {creating ? (
        <form
          className="flex gap-1 border-b border-line px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const nextName = name.trim();
            if (!nextName) {
              return;
            }
            void run(async () => {
              await tauriGit.createBranch(path, nextName);
              setName("");
              setCreating(false);
            });
          }}
        >
          <input
            value={name}
            disabled={busy}
            placeholder="Nueva rama"
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="rounded px-2 py-1 text-xs text-accent disabled:text-muted"
          >
            Crear
          </button>
        </form>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {loading && branches.length === 0 ? (
          <p className="px-3 text-xs text-muted">Cargando…</p>
        ) : null}
        {error ? <p className="px-3 text-xs text-warn">{error}</p> : null}
        {actionError ? (
          <p className="px-3 text-xs text-warn">{actionError}</p>
        ) : null}
        {local.length > 0 ? (
          <BranchGroup
            title="Local"
            branches={local}
            folded={folded.Local === true}
            onToggle={() =>
              setFolded((current) => ({ ...current, Local: !current.Local }))
            }
            onOpen={openMenu}
          />
        ) : null}
        {remoteNames.map((remote) => (
          <BranchGroup
            key={remote}
            title={remote}
            branches={visible.filter((branch) => branch.remote === remote)}
            folded={folded[remote] === true}
            onToggle={() =>
              setFolded((current) => ({
                ...current,
                [remote]: !current[remote],
              }))
            }
            onOpen={openMenu}
          />
        ))}
        {!loading && visible.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">
            {branches.length === 0 ? "Sin ramas" : "Ninguna rama coincide"}
          </p>
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
    </aside>
  );

  function branchItems(branch: BranchRef): MenuItem[] {
    const local = branch.remote === null;
    return [
      {
        id: "checkout",
        label: "Checkout",
        disabled: !local || branch.isHead || busy,
        onSelect: () => {
          void run(() => tauriGit.checkoutBranch(path, branch.name));
        },
      },
      {
        id: "pull",
        label: "Pull",
        disabled: !branch.isHead || busy,
        onSelect: () => {
          void run(() => tauriGit.pull(path));
        },
      },
      {
        id: "push",
        label: "Push",
        disabled: !branch.isHead || busy,
        onSelect: () => {
          void run(() => tauriGit.push(path));
        },
      },
      {
        id: "create",
        label: "Crear rama aquí",
        disabled: !branch.tipSha || busy,
        onSelect: () => {
          const nextName = window.prompt("Nombre de la nueva rama");
          const tip = branch.tipSha;
          if (!nextName || !tip) {
            return;
          }
          void run(() => tauriGit.createBranchAt(path, nextName, tip));
        },
      },
      {
        id: "copy",
        label: "Copiar nombre",
        onSelect: () => {
          void navigator.clipboard.writeText(branch.name);
        },
      },
      {
        id: "delete",
        label: "Borrar",
        danger: true,
        disabled: !local || branch.isHead || busy,
        onSelect: () => {
          if (!window.confirm(`¿Borrar la rama ${branch.name}?`)) {
            return;
          }
          void run(() => tauriGit.deleteBranch(path, branch.name));
        },
      },
    ];
  }
}

function shortName(branch: BranchRef): string {
  if (!branch.remote) {
    return branch.name;
  }
  const prefix = `${branch.remote}/`;
  return branch.name.startsWith(prefix)
    ? branch.name.slice(prefix.length)
    : branch.name;
}

function BranchGroup({
  title,
  branches,
  folded,
  onToggle,
  onOpen,
}: {
  title: string;
  branches: BranchRef[];
  folded: boolean;
  onToggle: () => void;
  onOpen: (branch: BranchRef, event: MouseEvent) => void;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] text-muted hover:text-text"
      >
        <span className="w-2">{folded ? "▸" : "▾"}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span>{branches.length}</span>
      </button>
      {folded ? null : (
        <ul>
          {branches.map((branch) => (
            <li key={`${branch.remote ?? "local"}:${branch.name}`}>
              <button
                type="button"
                onClick={(event) => onOpen(branch, event)}
                className={`flex h-7 w-full items-center gap-2 px-3 text-left text-xs ${
                  branch.isHead
                    ? "bg-accent-dim text-accent"
                    : "text-text hover:bg-surface-overlay"
                }`}
              >
                <GitBranch size={13} className="shrink-0" />
                <span className="truncate">{shortName(branch)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
