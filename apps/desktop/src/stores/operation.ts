import { create } from "zustand";

export type OperationKind =
  | "fetch"
  | "pull"
  | "push"
  | "checkout"
  | "clone"
  | "other";

interface OperationStore {
  running: boolean;
  kind: OperationKind | null;
  label: string;
  detail: string | null;
  notice: string | null;
  start: (kind: OperationKind, label: string) => void;
  progress: (detail: string) => void;
  succeed: () => void;
  fail: (notice: string) => void;
  stopCancelled: () => void;
}

export const useOperation = create<OperationStore>((set) => ({
  running: false,
  kind: null,
  label: "",
  detail: null,
  notice: null,
  start: (kind, label) =>
    set({
      running: true,
      kind,
      label,
      detail: null,
      notice: null,
    }),
  progress: (detail) =>
    set((state) => (state.running ? { detail: detail.trim() || null } : {})),
  succeed: () =>
    set({
      running: false,
      kind: null,
      label: "",
      detail: null,
      notice: null,
    }),
  fail: (notice) =>
    set({
      running: false,
      kind: null,
      label: "",
      detail: null,
      notice,
    }),
  stopCancelled: () =>
    set({
      running: false,
      kind: null,
      label: "",
      detail: null,
      notice: "Cancelado",
    }),
}));

export function operationStatus(
  branch: string,
  operation: Pick<OperationStore, "running" | "label" | "detail" | "notice">,
): { text: string; warn: boolean } {
  if (operation.running) {
    const detail = operation.detail ? ` · ${operation.detail}` : "…";
    return { text: `${operation.label}${detail}`, warn: false };
  }
  if (operation.notice && operation.notice !== "Cancelado") {
    return { text: operation.notice, warn: true };
  }
  if (operation.notice === "Cancelado") {
    return { text: "Cancelado", warn: false };
  }
  return { text: branch, warn: false };
}
