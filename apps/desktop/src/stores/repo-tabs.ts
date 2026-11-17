import { create } from "zustand";
import {
  activate,
  activePath,
  closeTab,
  initialTabs,
  newTab,
  openPath,
  renamePath,
  reopenClosed,
  showManagement,
  type TabState,
} from "../lib/repo-tabs";

interface RepoTabs extends TabState {
  newTab: () => void;
  close: (id: string) => void;
  reopen: () => string | null;
  openPath: (path: string, name: string) => void;
  renamePath: (path: string, name: string) => void;
  activate: (id: string) => void;
  showManagement: () => void;
  activePath: () => string | null;
}

function nextId(): string {
  return crypto.randomUUID();
}

export const useRepoTabs = create<RepoTabs>((set, get) => ({
  ...initialTabs(),
  newTab: () => set((state) => newTab(state, nextId())),
  close: (id) => set((state) => closeTab(state, id, nextId())),
  reopen: () => {
    const path = get().closed[0] ?? null;
    if (!path) {
      return null;
    }
    set((state) => reopenClosed(state, nextId()));
    return path;
  },
  openPath: (path, name) =>
    set((state) => openPath(state, path, name, nextId())),
  renamePath: (path, name) => set((state) => renamePath(state, path, name)),
  activate: (id) => set((state) => activate(state, id)),
  showManagement: () => set((state) => showManagement(state)),
  activePath: () => activePath(get()),
}));
