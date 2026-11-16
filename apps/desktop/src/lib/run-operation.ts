import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { type OperationKind, useOperation } from "../stores/operation";

export type { OperationKind };

import { holdRemaining } from "./activity-hold";
import { toGitClientError } from "./git/errors";

const NETWORK = new Set<OperationKind>(["fetch", "pull", "push", "clone"]);

let suppressUntil = 0;
let presentation = 0;

function showDock(kind: OperationKind | null): void {
  void invoke("set_dock_activity", { kind }).catch(() => undefined);
}

function scheduleRelease(token: number, startedAt: number): void {
  const wait = holdRemaining(startedAt, Date.now());
  setTimeout(() => {
    if (token !== presentation || useOperation.getState().running) {
      return;
    }
    useOperation.getState().release();
    showDock(null);
  }, wait);
}

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
  presentation += 1;
  const token = presentation;
  const startedAt = Date.now();
  useOperation.getState().start(kind, label);
  showDock(kind);
  try {
    await action();
  } catch (reason: unknown) {
    const message = toGitClientError(reason).message;
    if (message.includes("Cancelado")) {
      useOperation.getState().stopCancelled();
    } else {
      useOperation.getState().fail(message);
    }
    scheduleRelease(token, startedAt);
    return;
  }
  useOperation.getState().succeed();
  suppressUntil = Date.now() + 500;
  scheduleRelease(token, startedAt);
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
