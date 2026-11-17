import { load } from "@tauri-apps/plugin-store";

const FILE = "appearance.json";

/** 1 is the size the interface ships with. */
export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.4] as const;

export type UiScale = (typeof UI_SCALES)[number];

const listeners = new Set<(scale: UiScale) => void>();
let current: UiScale = 1;

export function normalizeUiScale(value: number): UiScale {
  if (!Number.isFinite(value)) {
    return 1;
  }
  let best: UiScale = 1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const scale of UI_SCALES) {
    const dist = Math.abs(scale - value);
    if (dist < bestDist) {
      best = scale;
      bestDist = dist;
    }
  }
  return best;
}

export function stepUiScale(scale: number, direction: -1 | 1): UiScale {
  const index = UI_SCALES.indexOf(normalizeUiScale(scale));
  const next = Math.min(UI_SCALES.length - 1, Math.max(0, index + direction));
  return UI_SCALES[next] ?? 1;
}

export function getUiScale(): UiScale {
  return current;
}

export function applyUiScale(scale: UiScale): void {
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  window.dispatchEvent(new Event("resize"));
}

export function adoptUiScale(scale: number): void {
  current = normalizeUiScale(scale);
  applyUiScale(current);
  for (const listener of listeners) {
    listener(current);
  }
}

export async function setUiScale(scale: number): Promise<void> {
  const next = normalizeUiScale(scale);
  adoptUiScale(next);
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("uiScale", next);
  await store.save();
}

export function onUiScale(listener: (scale: UiScale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function readUiScale(): Promise<UiScale> {
  try {
    const store = await load(FILE, { autoSave: false, defaults: {} });
    const saved = await store.get<unknown>("uiScale");
    return normalizeUiScale(typeof saved === "number" ? saved : 1);
  } catch {
    return 1;
  }
}
