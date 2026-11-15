import { Link } from "@tanstack/react-router";
import { FolderOpen, GitBranchPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppVersion } from "../../hooks/useAppVersion";
import { formatWhen } from "../../lib/format";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { clearOpenRepo } from "../../lib/open-session";
import { type RecentRepo, readRecents } from "../../lib/recents";
import { adoptRepository, openChosenFolder } from "../../lib/repo-actions";
import { useCommandUi } from "../../stores/command-ui";
import { useRepoSession } from "../../stores/repo-session";

export function WelcomePage() {
  const setInfo = useRepoSession((state) => state.setInfo);
  const [recents, setRecents] = useState<RecentRepo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openClone = useCommandUi((state) => state.openClone);
  const [desktopReady, setDesktopReady] = useState(true);
  const version = useAppVersion();

  useEffect(() => {
    clearOpenRepo().catch(() => undefined);
    readRecents()
      .then(setRecents)
      .catch(() => setDesktopReady(false));
  }, []);

  async function openPath(path: string) {
    setBusy(true);
    setError(null);
    try {
      const repo = await tauriGit.openRepository(path);
      setInfo(repo);
      await adoptRepository(repo);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    setBusy(true);
    setError(null);
    try {
      await openChosenFolder();
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex h-full items-center justify-center bg-surface px-6">
      <div className="w-full max-w-xl">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">
          GitHydra <span className="font-mono tracking-normal">v{version}</span>
        </p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <h1 className="text-3xl font-semibold">Abrir un repositorio</h1>
          <Link to="/settings" className="text-xs text-accent">
            Preferencias
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          Elige una carpeta git local o clona una URL.
        </p>
        {error ? <p className="mt-4 text-sm text-warn">{error}</p> : null}
        {!desktopReady ? (
          <p className="mt-4 text-sm text-muted">
            Abre la ventana de escritorio con `pnpm dev`.
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              void browse();
            }}
            disabled={busy || !desktopReady}
            className="inline-flex items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            <FolderOpen size={16} />
            Abrir carpeta
          </button>
          <button
            type="button"
            disabled={busy || !desktopReady}
            onClick={openClone}
            className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 text-sm"
          >
            <GitBranchPlus size={16} />
            Clonar desde URL
          </button>
        </div>
        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Recientes
          </h2>
          {recents.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Todavía no hay repositorios recientes.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded border border-line">
              {recents.map((repo) => (
                <li key={repo.path}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void openPath(repo.path);
                    }}
                    className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left hover:bg-surface-raised"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {repo.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {repo.path}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {formatWhen(repo.openedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
