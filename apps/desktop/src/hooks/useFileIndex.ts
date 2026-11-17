import { useEffect, useRef, useState } from "react";
import { toGitClientError } from "../lib/git/errors";
import { indexWorkdir } from "../lib/workdir";

export function useFileIndex(path: string, revision: number) {
  const [files, setFiles] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const previous = useRef(path);

  useEffect(() => {
    let cancelled = false;
    const generation = revision + tick;
    if (previous.current !== path) {
      previous.current = path;
      setFiles([]);
      setReady(false);
      setError(null);
    }
    indexWorkdir(path)
      .then((index) => {
        if (cancelled || generation !== revision + tick) {
          return;
        }
        setFiles(index.paths);
        setTruncated(index.truncated);
        setError(null);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }
        setError(toGitClientError(reason).message);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision, tick]);

  return {
    files,
    truncated,
    error,
    ready,
    refresh: () => setTick((current) => current + 1),
  };
}
