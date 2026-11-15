import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import { externalRefreshAllowed } from "../lib/run-operation";

export function useRepoSync(path: string, refresh: () => Promise<void>): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let stop = false;
    const unlistens: Array<() => void> = [];
    void invoke("watch_repository", { path }).catch(() => undefined);
    void listen("repo-changed", () => {
      if (!externalRefreshAllowed()) {
        return;
      }
      void refreshRef.current();
    })
      .then((dispose) => {
        if (stop) {
          dispose();
          return;
        }
        unlistens.push(dispose);
      })
      .catch(() => undefined);
    void getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (!payload || !externalRefreshAllowed()) {
          return;
        }
        void refreshRef.current();
      })
      .then((dispose) => {
        if (stop) {
          dispose();
          return;
        }
        unlistens.push(dispose);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
      for (const dispose of unlistens) {
        dispose();
      }
    };
  }, [path]);
}
