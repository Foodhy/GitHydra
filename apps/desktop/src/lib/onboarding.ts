import { load } from "@tauri-apps/plugin-store";

const FILE = "appearance.json";

export type OnboardingStep = 2 | 3;

export interface OnboardingState {
  done: boolean;
  step: OnboardingStep | null;
}

export function shouldOnboard(done: boolean, recentCount: number): boolean {
  return !done && recentCount === 0;
}

export async function readOnboarding(): Promise<OnboardingState> {
  try {
    const store = await load(FILE, { autoSave: false, defaults: {} });
    const done = (await store.get<boolean>("onboardingDone")) === true;
    const saved = await store.get<number>("onboardingStep");
    const step = saved === 2 || saved === 3 ? saved : null;
    return { done, step };
  } catch {
    return { done: false, step: null };
  }
}

export async function beginOnboarding(): Promise<void> {
  const current = await readOnboarding();
  if (current.done || current.step !== null) {
    return;
  }
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("onboardingStep", 2);
  await store.save();
}

export async function advanceOnboarding(): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("onboardingStep", 3);
  await store.save();
}

export async function finishOnboarding(): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("onboardingDone", true);
  await store.save();
}
