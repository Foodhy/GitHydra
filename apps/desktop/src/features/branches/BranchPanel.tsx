import type { BranchRef, LinkedWorktree } from "@githydra/contracts";
import { Folder, GitBranch, Plus } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useBranches } from "../../hooks/useBranches";
import { useWorktrees } from "../../hooks/useWorktrees";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { useT } from "../../lib/i18n";
import { type OperationKind, runOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import { ActivityFooter } from "./ActivityFooter";
import { AddWorktreeDialog, type WorktreeSeed } from "./AddWorktreeDialog";
import { WorktreeList } from "./WorktreeList";

export function BranchPanel({
  path,
  revision,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  onRepositoryChanged: () => Promise<void>;
}) {
  const { branches, error, loading, refreshing } = useBranches(path, revision);
  const { worktrees, error: worktreeError } = useWorktrees(path, revision);
  const running = useOperation((state) => state.running);
  const tr = useT();
  const notice = useOperation((state) => state.notice);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [worktreeSeed, setWorktreeSeed] = useState<WorktreeSeed | null>(null);
  const selected = preferredKey(branches, selectedKey);
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

  function run(
    kind: OperationKind,
    label: string,
    action: () => Promise<void>,
  ) {
    void runOperation(kind, label, action, onRepositoryChanged);
  }

  function toggleFolder(key: string) {
    setFolded((current) => ({ ...current, [key]: !current[key] }));
  }

  function folderOpen(key: string) {
    if (needle.length > 0) {
      return true;
    }
    return folded[key] === true;
  }

  function selectBranch(branch: BranchRef) {
    setSelectedKey(branchKey(branch));
  }

  function openMenu(branch: BranchRef, event: MouseEvent) {
    selectBranch(branch);
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
          placeholder={tr("branch.filter")}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted"
        />
        <button
          type="button"
          title={tr("branch.new")}
          aria-label={tr("branch.new")}
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
            void runOperation(
              "other",
              tr("branch.creating"),
              async () => {
                await tauriGit.createBranch(path, nextName);
                setName("");
                setCreating(false);
              },
              onRepositoryChanged,
            );
          }}
        >
          <input
            value={name}
            disabled={running}
            placeholder={tr("branch.new")}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={running || name.trim().length === 0}
            className="rounded px-2 py-1 text-xs text-accent disabled:text-muted"
          >
            {tr("branch.create")}
          </button>
        </form>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {loading && branches.length === 0 ? (
          <p className="px-3 text-xs text-muted">{tr("branch.loading")}</p>
        ) : null}
        {error ? <p className="px-3 text-xs text-warn">{error}</p> : null}
        {notice && notice !== "Cancelado" ? (
          <p className="px-3 text-xs text-warn">{notice}</p>
        ) : null}
        {refreshing ? (
          <p className="px-3 text-[11px] text-muted">
            {tr("branch.refreshing")}
          </p>
        ) : null}
        {local.length > 0 ? (
          <BranchGroup
            title={tr("branch.local")}
            branches={local}
            folded={folded.Local === true}
            folderOpen={folderOpen}
            onToggle={() =>
              setFolded((current) => ({ ...current, Local: !current.Local }))
            }
            onToggleFolder={(folder) => toggleFolder(`Local/${folder}`)}
            selectedKey={selected}
            onSelect={selectBranch}
            onOpen={openMenu}
            hintFor={(branch) => occupiedPath(branch, worktrees)}
          />
        ) : null}
        {remoteNames.map((remote) => (
          <BranchGroup
            key={remote}
            title={remote}
            branches={visible.filter((branch) => branch.remote === remote)}
            folded={folded[remote] === true}
            folderOpen={folderOpen}
            onToggle={() =>
              setFolded((current) => ({
                ...current,
                [remote]: !current[remote],
              }))
            }
            onToggleFolder={(folder) => toggleFolder(`${remote}/${folder}`)}
            selectedKey={selected}
            onSelect={selectBranch}
            onOpen={openMenu}
            hintFor={(branch) => occupiedPath(branch, worktrees)}
          />
        ))}
        {!loading && visible.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">
            {branches.length === 0 ? tr("branch.empty") : tr("branch.none")}
          </p>
        ) : null}
        <WorktreeList
          path={path}
          worktrees={worktrees}
          error={worktreeError}
          running={running}
          onRepositoryChanged={onRepositoryChanged}
        />
      </div>
      <ActivityFooter />
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
    </aside>
  );

  function branchItems(branch: BranchRef): MenuItem[] {
    const local = branch.remote === null;
    return [
      {
        id: "checkout",
        label: tr("branch.checkout"),
        disabled: !local || branch.isHead || running,
        onSelect: () => {
          void run(
            "checkout",
            tr("branch.checkingOut", { name: shortName(branch) }),
            () => tauriGit.checkoutBranch(path, branch.name),
          );
        },
      },
      {
        id: "pull",
        label: tr("branch.pull"),
        disabled: !branch.isHead || running,
        onSelect: () => {
          void run("pull", tr("branch.pull"), () => tauriGit.pull(path));
        },
      },
      {
        id: "push",
        label: tr("branch.push"),
        disabled: !branch.isHead || running,
        onSelect: () => {
          void run("push", tr("branch.push"), () => tauriGit.push(path));
        },
      },
      {
        id: "worktree",
        label: tr("branch.worktree"),
        disabled: !branch.tipSha || running,
        onSelect: () => {
          setWorktreeSeed({
            branch: shortName(branch),
            sha: branch.tipSha,
            createBranch: branch.remote !== null,
          });
        },
      },
      {
        id: "create",
        label: tr("branch.createHere"),
        disabled: !branch.tipSha || running,
        onSelect: () => {
          const nextName = window.prompt(tr("branch.askName"));
          const tip = branch.tipSha;
          if (!nextName || !tip) {
            return;
          }
          void run("other", tr("branch.creating"), () =>
            tauriGit.createBranchAt(path, nextName, tip),
          );
        },
      },
      {
        id: "rename",
        label: tr("branch.rename"),
        disabled: !local || running,
        onSelect: () => {
          const nextName = window.prompt(
            tr("branch.askRename"),
            shortName(branch),
          );
          if (!nextName || nextName.trim() === branch.name) {
            return;
          }
          void run("other", tr("branch.renaming"), () =>
            tauriGit.renameBranch(path, branch.name, nextName),
          );
        },
      },
      {
        id: "upstream",
        label: tr("branch.upstream"),
        disabled: !local || running,
        onSelect: () => {
          const upstream = window.prompt(tr("branch.askUpstream"), "origin/");
          if (!upstream) {
            return;
          }
          void run("other", tr("branch.updatingUpstream"), () =>
            tauriGit.setUpstream(path, branch.name, upstream),
          );
        },
      },
      {
        id: "copy",
        label: tr("branch.copyName"),
        onSelect: () => {
          void navigator.clipboard.writeText(branch.name);
        },
      },
      {
        id: "delete",
        label: tr("branch.delete"),
        danger: true,
        disabled: !local || branch.isHead || running,
        onSelect: () => {
          if (
            !window.confirm(tr("branch.confirmDelete", { name: branch.name }))
          ) {
            return;
          }
          void run("other", tr("branch.deleting"), () =>
            tauriGit.deleteBranch(path, branch.name),
          );
        },
      },
    ];
  }
}

function branchKey(branch: BranchRef): string {
  return `${branch.remote ?? "local"}:${branch.name}`;
}

function preferredKey(
  branches: BranchRef[],
  selected: string | null,
): string | null {
  if (selected && branches.some((branch) => branchKey(branch) === selected)) {
    return selected;
  }
  const head =
    branches.find((branch) => branch.isHead && branch.remote === null) ??
    branches.find((branch) => branch.isHead);
  return head ? branchKey(head) : null;
}

function occupiedPath(
  branch: BranchRef,
  worktrees: LinkedWorktree[],
): string | null {
  if (branch.remote !== null) {
    return null;
  }
  return (
    worktrees.find((copy) => copy.branch === branch.name && !copy.isCurrent)
      ?.path ?? null
  );
}

function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
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
  folderOpen,
  selectedKey,
  onToggle,
  onToggleFolder,
  onSelect,
  onOpen,
  hintFor,
}: {
  title: string;
  branches: BranchRef[];
  folded: boolean;
  folderOpen: (key: string) => boolean;
  selectedKey: string | null;
  onToggle: () => void;
  onToggleFolder: (folder: string) => void;
  onSelect: (branch: BranchRef) => void;
  onOpen: (branch: BranchRef, event: MouseEvent) => void;
  hintFor: (branch: BranchRef) => string | null;
}) {
  const tree = organize(branches);
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
          {tree.pinned ? (
            <BranchRow
              branch={tree.pinned}
              label={shortName(tree.pinned)}
              hint={hintFor(tree.pinned)}
              selected={branchKey(tree.pinned) === selectedKey}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ) : null}
          {tree.loose.map((branch) => (
            <BranchRow
              key={branchKey(branch)}
              branch={branch}
              label={shortName(branch)}
              hint={hintFor(branch)}
              selected={branchKey(branch) === selectedKey}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
          {tree.folders.map((folder) => {
            const open = folderOpen(`${title}/${folder.name}`);
            return (
              <li key={folder.name}>
                <button
                  type="button"
                  onClick={() => onToggleFolder(folder.name)}
                  className="flex h-7 w-full items-center gap-2 px-3 text-left text-xs text-muted hover:bg-surface-overlay hover:text-text"
                >
                  <span className="w-2 text-[10px]">{open ? "▾" : "▸"}</span>
                  <Folder size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-[11px]">{folder.branches.length}</span>
                </button>
                {open ? (
                  <ul>
                    {folder.branches.map((branch) => (
                      <BranchRow
                        key={branchKey(branch)}
                        branch={branch}
                        label={labelInFolder(branch, folder.name)}
                        hint={hintFor(branch)}
                        indent
                        selected={branchKey(branch) === selectedKey}
                        onSelect={onSelect}
                        onOpen={onOpen}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BranchRow({
  branch,
  label,
  hint,
  indent = false,
  selected,
  onSelect,
  onOpen,
}: {
  branch: BranchRef;
  label: string;
  hint: string | null;
  indent?: boolean;
  selected: boolean;
  onSelect: (branch: BranchRef) => void;
  onOpen: (branch: BranchRef, event: MouseEvent) => void;
}) {
  const tone = selected
    ? branch.isHead
      ? "bg-accent-dim text-accent"
      : "bg-surface-overlay text-text"
    : branch.isHead
      ? "text-accent hover:bg-surface-overlay"
      : "text-text hover:bg-surface-overlay";
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        title={branch.name}
        onClick={() => onSelect(branch)}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpen(branch, event);
        }}
        className={`flex h-7 w-full items-center gap-2 text-left text-xs ${
          indent ? "pr-3 pl-8" : "px-3"
        } ${tone}`}
      >
        <GitBranch size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        {hint ? (
          <span
            className="ml-auto max-w-[45%] truncate font-mono text-[10px] text-muted"
            title={hint}
          >
            {shortPath(hint)}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function organize(branches: BranchRef[]): {
  pinned: BranchRef | null;
  loose: BranchRef[];
  folders: { name: string; branches: BranchRef[] }[];
} {
  const pinned = branches.find((branch) => branch.isHead) ?? null;
  const rest = pinned
    ? branches.filter((branch) => branch !== pinned)
    : branches;
  const buckets = new Map<string, BranchRef[]>();
  const loose: BranchRef[] = [];
  for (const branch of rest) {
    const slash = shortName(branch).indexOf("/");
    if (slash <= 0) {
      loose.push(branch);
      continue;
    }
    const folder = shortName(branch).slice(0, slash);
    const items = buckets.get(folder) ?? [];
    items.push(branch);
    buckets.set(folder, items);
  }
  const folders: { name: string; branches: BranchRef[] }[] = [];
  for (const [name, items] of buckets) {
    if (items.length < 2) {
      loose.push(...items);
      continue;
    }
    folders.push({
      name,
      branches: items.sort((left, right) =>
        shortName(left).localeCompare(shortName(right)),
      ),
    });
  }
  loose.sort((left, right) => shortName(left).localeCompare(shortName(right)));
  folders.sort((left, right) => left.name.localeCompare(right.name));
  return { pinned, loose, folders };
}

function labelInFolder(branch: BranchRef, folder: string): string {
  const name = shortName(branch);
  const prefix = `${folder}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
