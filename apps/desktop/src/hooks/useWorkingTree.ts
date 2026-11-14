import type { WorkingTreeEntry } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../lib/git/errors";
import { tauriGit } from "../lib/git/tauri-git-adapter";

export function useWorkingTree(path: string | null) {
  const [entries, setEntries] = useState<WorkingTreeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tauriGit
      .workingTreeStatus(path)
      .then((status) => {
        if (!cancelled) {
          setEntries(status.entries);
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
  }, [path]);

  return { entries, error, loading };
}
