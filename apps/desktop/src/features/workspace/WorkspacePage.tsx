import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { rememberOpenRepo } from "../../lib/open-session";
import { rememberRecent } from "../../lib/recents";
import { useRepoSession } from "../../stores/repo-session";
import { WorkspaceShell } from "./WorkspaceShell";

const routeApi = getRouteApi("/repo/$");

export function WorkspacePage() {
  const { _splat } = routeApi.useParams();
  const requestedPath = toAbsolutePath(_splat);
  const setInfo = useRepoSession((state) => state.setInfo);
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOpenedPath(null);
    tauriGit
      .openRepository(requestedPath)
      .then(async (repo) => {
        if (cancelled) {
          return;
        }
        setInfo(repo);
        setOpenedPath(repo.path);
        await rememberRecent(repo);
        await rememberOpenRepo(repo.path);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setInfo(null);
          setError(toGitClientError(reason).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPath, setInfo]);

  if (error) {
    return (
      <main className="flex h-full items-center justify-center px-6">
        <p className="max-w-lg text-sm text-warn">{error}</p>
      </main>
    );
  }

  if (!openedPath) {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Abriendo repositorio…</p>
      </main>
    );
  }

  return <WorkspaceShell path={openedPath} />;
}

function toAbsolutePath(splat: string | undefined): string {
  if (!splat) {
    return "";
  }
  return splat.startsWith("/") ? splat : `/${splat}`;
}
