import { parseTerminalDock, TERMINAL_DOCK_KEY } from "../terminal/dock.ts";
import {
  cloneLayout,
  type LayoutNode,
  migrateLayout,
  parseLayout,
  parseLayoutNode,
} from "./layout-tree.ts";
import { parsePlacedView, VIEW_DOCK_KEY } from "./view-dock.ts";

export const PRESET_KEY = "githydra.layoutPresets";
export const LAYOUT_KEY_PREFIX = "githydra.layout:";

export interface LayoutPreset {
  id: string;
  name: string;
  tree: LayoutNode;
}

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function projectLayoutKey(path: string): string {
  return `${LAYOUT_KEY_PREFIX}${encodeURIComponent(path)}`;
}

export function readProjectTree(
  storage: LayoutStorage,
  path: string,
): LayoutNode | null {
  return parseLayout(storage.getItem(projectLayoutKey(path)));
}

export function writeProjectTree(
  storage: LayoutStorage,
  path: string,
  tree: LayoutNode,
): void {
  storage.setItem(projectLayoutKey(path), JSON.stringify(tree));
}

export function loadProjectTree(
  storage: LayoutStorage,
  path: string,
): LayoutNode {
  return (
    readProjectTree(storage, path) ??
    migrateLayout(
      parseTerminalDock(storage.getItem(TERMINAL_DOCK_KEY)),
      parsePlacedView(storage.getItem(VIEW_DOCK_KEY)),
    )
  );
}

export function readPresets(storage: LayoutStorage): LayoutPreset[] {
  const raw = storage.getItem(PRESET_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const presets: LayoutPreset[] = [];
    for (const item of parsed) {
      const preset = readPreset(item);
      if (preset) {
        presets.push(preset);
      }
    }
    return presets;
  } catch {
    return [];
  }
}

export function savePreset(
  storage: LayoutStorage,
  name: string,
  tree: LayoutNode,
  id: string,
): LayoutPreset[] {
  const trimmed = name.trim().slice(0, 40);
  const current = readPresets(storage);
  if (!trimmed) {
    return current;
  }
  const next = [
    ...current.filter((preset) => preset.id !== id),
    { id, name: trimmed, tree: cloneLayout(tree) },
  ];
  storage.setItem(PRESET_KEY, JSON.stringify(next));
  return next;
}

export function deletePreset(
  storage: LayoutStorage,
  id: string,
): LayoutPreset[] {
  const next = readPresets(storage).filter((preset) => preset.id !== id);
  storage.setItem(PRESET_KEY, JSON.stringify(next));
  return next;
}

function readPreset(value: unknown): LayoutPreset | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { id?: unknown; name?: unknown; tree?: unknown };
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  const tree = parseLayoutNode(record.tree);
  if (!tree) {
    return null;
  }
  return { id: record.id, name: record.name, tree };
}
