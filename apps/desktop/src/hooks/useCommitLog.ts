import type { CommitSummary } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../lib/git/errors";
import { tauriGit } from "../lib/git/tauri-git-adapter";

const PAGE = 80;

export function useCommitLog(path: string | null) {
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCommits([]);
    setCursor(null);
    tauriGit
      .listCommits(path, PAGE, null)
      .then((page) => {
        if (cancelled) {
          return;
        }
        setCommits(page.commits);
        setCursor(page.nextCursor);
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
  }, [path]);

  async function loadMore() {
    if (!path || !cursor || loading) {
      return;
    }
    setLoading(true);
    try {
      const page = await tauriGit.listCommits(path, PAGE, cursor);
      setCommits((current) => [...current, ...page.commits]);
      setCursor(page.nextCursor);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    } finally {
      setLoading(false);
    }
  }

  return { commits, cursor, loading, error, loadMore };
}
