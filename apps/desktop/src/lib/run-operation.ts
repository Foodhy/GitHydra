import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { type OperationKind, useOperation } from "../stores/operation";

export type { OperationKind };

import { toGitClientError } from "./git/errors";

const NETWORK = new Set<OperationKind>(["fetch", "pull", "push", "clone"]);

let suppressUntil = 0;

export function externalRefreshAllowed(): boolean {
  return Date.now() > suppressUntil && !useOperation.getState().running;
}

export function canCancel(kind: OperationKind | null): boolean {
  return kind !== null && NETWORK.has(kind);
}

export async function cancelOperation(): Promise<void> {
  await invoke("cancel_git_operation");
}

export async function runOperation(
  kind: OperationKind,
  label: string,
  action: () => Promise<void>,
  refresh: () => Promise<void>,
): Promise<void> {
  if (useOperation.getState().running) {
    return;
  }
  useOperation.getState().start(kind, label);
  try {
    await action();
  } catch (reason: unknown) {
    const message = toGitClientError(reason).message;
    if (message.includes("Cancelado")) {
      useOperation.getState().stopCancelled();
    } else {
      useOperation.getState().fail(message);
    }
    return;
  }
  useOperation.getState().succeed();
  suppressUntil = Date.now() + 500;
  try {
    await refresh();
  } catch (reason: unknown) {
    useOperation.getState().fail(toGitClientError(reason).message);
  }
}

export function useGitProgress(): void {
  useEffect(() => {
    let stop = false;
    let unlisten: (() => void) | null = null;
    void listen<string>("git-progress", (event) => {
      useOperation.getState().progress(event.payload);
    })
      .then((dispose) => {
        if (stop) {
          dispose();
          return;
        }
        unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      stop = true;
      unlisten?.();
    };
  }, []);
}
