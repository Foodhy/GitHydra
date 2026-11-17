import { open } from "@tauri-apps/plugin-dialog";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { adoptRepository } from "../../lib/repo-actions";
import { runOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import { useOverlay } from "../../stores/overlay";

export interface WorktreeSeed {
  branch: string;
  sha: string | null;
  createBranch: boolean;
}

export function siblingDirectory(repoPath: string, branch: string): string {
  const slash = repoPath.lastIndexOf("/");
  const parent = slash > 0 ? repoPath.slice(0, slash) : "";
  const base = slash >= 0 ? repoPath.slice(slash + 1) : repoPath;
  const slug = branch.trim().replace(/\//g, "-") || "copia";
  const folder = `${base || "repo"}-${slug}`;
  return parent ? `${parent}/${folder}` : folder;
}

export function AddWorktreeDialog({
  path,
  seed,
  onClose,
  onRepositoryChanged,
}: {
  path: string;
  seed: WorktreeSeed;
  onClose: () => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  const running = useOperation((state) => state.running);
  const [branch, setBranch] = useState(seed.branch);
  const [createBranch, setCreateBranch] = useState(seed.createBranch);
  const [directory, setDirectory] = useState(() =>
    siblingDirectory(path, seed.branch),
  );
  const [directoryTouched, setDirectoryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    useOverlay.getState().push();
    return () => useOverlay.getState().pop();
  }, []);

  function editBranch(next: string) {
    setBranch(next);
    if (!directoryTouched) {
      setDirectory(siblingDirectory(path, next));
    }
  }

  async function chooseDirectory(event: MouseEvent) {
    event.preventDefault();
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Carpeta de la copia",
    });
    if (typeof selected !== "string") {
      return;
    }
    setDirectory(selected);
    setDirectoryTouched(true);
  }

  async function submit() {
    const nextBranch = branch.trim();
    const nextDirectory = directory.trim();
    if (!nextBranch || !nextDirectory || running) {
      return;
    }
    setError(null);
    await runOperation(
      "other",
      "Abriendo copia",
      async () => {
        const repo = await tauriGit.addWorktree(path, {
          directory: nextDirectory,
          branch: nextBranch,
          sha: seed.sha,
          createBranch,
        });
        await adoptRepository(repo);
      },
      onRepositoryChanged,
    );
    const notice = useOperation.getState().notice;
    if (notice) {
      setError(notice);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <form
        className="w-full max-w-lg rounded border border-line bg-surface-raised p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-sm font-medium">Abrir en otra carpeta</h2>
        <p className="mt-1 text-xs text-muted">
          La carpeta actual no cambia de rama. .env, node_modules y el resto de
          archivos sin seguimiento no se copian. El servidor de desarrollo de
          esa carpeta necesita otro puerto.
        </p>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={createBranch}
            onChange={(event) => setCreateBranch(event.target.checked)}
          />
          Crear rama nueva en este punto
        </label>
        <label className="mt-3 block text-xs text-muted">
          Rama
          <input
            value={branch}
            disabled={running}
            onChange={(event) => editBranch(event.target.value)}
            className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-xs text-text"
          />
        </label>
        <label className="mt-3 block text-xs text-muted">
          Carpeta
          <span className="mt-1 flex gap-2">
            <input
              value={directory}
              disabled={running}
              onChange={(event) => {
                setDirectory(event.target.value);
                setDirectoryTouched(true);
              }}
              className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-text"
            />
            <button
              type="button"
              disabled={running}
              onClick={(event) => {
                void chooseDirectory(event);
              }}
              className="rounded px-2 py-1 text-xs text-accent"
            >
              Elegir
            </button>
          </span>
        </label>
        {error ? <p className="mt-3 text-xs text-warn">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              running ||
              branch.trim().length === 0 ||
              directory.trim().length === 0
            }
            className="rounded bg-accent px-2 py-1 text-xs font-medium text-surface disabled:opacity-40"
          >
            Abrir
          </button>
        </div>
      </form>
    </div>
  );
}
