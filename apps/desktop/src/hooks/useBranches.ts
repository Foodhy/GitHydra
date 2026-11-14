import type { BranchRef } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../lib/git/errors";
import { tauriGit } from "../lib/git/tauri-git-adapter";

export function useBranches(path: string | null) {
  const [branches, setBranches] = useState<BranchRef[]>([]);
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
      .listBranches(path)
      .then((rows) => {
        if (!cancelled) {
          setBranches(rows);
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

  return { branches, error, loading };
}
