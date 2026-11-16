import { TERMINAL_DOCK_KEY } from "../terminal/dock.ts";
import { LAYOUT_KEY_PREFIX } from "./layout-presets.ts";
import { VIEW_DOCK_KEY } from "./view-dock.ts";

export const PANEL_LAYOUT_PREFIX = "react-resizable-panels:githydra-";

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export function layoutStorageFrom(storage: Storage): LayoutStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      storage.removeItem(key);
    },
    keys: () => Object.keys(storage),
  };
}

export function resetWorkspaceLayout(storage: LayoutStorage): void {
  for (const key of [...storage.keys()]) {
    if (
      key.startsWith(PANEL_LAYOUT_PREFIX) ||
      key.startsWith(LAYOUT_KEY_PREFIX) ||
      key === VIEW_DOCK_KEY ||
      key === TERMINAL_DOCK_KEY
    ) {
      storage.removeItem(key);
    }
  }
}
