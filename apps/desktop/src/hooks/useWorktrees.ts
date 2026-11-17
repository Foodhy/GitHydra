import type { LinkedWorktree } from "@githydra/contracts";
import { useEffect, useRef, useState } from "react";
import { toGitClientError } from "../lib/git/errors";
import { tauriGit } from "../lib/git/tauri-git-adapter";
import { worktreeTabName } from "../lib/repo-tabs";
import { useRepoTabs } from "../stores/repo-tabs";

export function useWorktrees(path: string | null, revision = 0) {
  const [worktrees, setWorktrees] = useState<LinkedWorktree[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previousPath = useRef(path);

  useEffect(() => {
    const switched = previousPath.current !== path;
    previousPath.current = path;
    if (switched) {
      setWorktrees([]);
    }
    if (!path || revision < 0) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tauriGit
      .listWorktrees(path)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setWorktrees(rows);
        for (const entry of rows) {
          useRepoTabs
            .getState()
            .renamePath(entry.path, worktreeTabName(entry, rows));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toGitClientError(reason).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  return { worktrees, error, loading };
}
