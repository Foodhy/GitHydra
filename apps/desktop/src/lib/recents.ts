import type { RepositoryInfo } from "@githydra/contracts";
import { load } from "@tauri-apps/plugin-store";

export interface RecentRepo {
  path: string;
  name: string;
  openedAt: string;
}

const FILE = "recents.json";
const KEY = "repos";
const LIMIT = 12;

export async function readRecents(): Promise<RecentRepo[]> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  return (await store.get<RecentRepo[]>(KEY)) ?? [];
}

export async function rememberRecent(info: RepositoryInfo): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  const current = (await store.get<RecentRepo[]>(KEY)) ?? [];
  const next: RecentRepo[] = [
    { path: info.path, name: info.name, openedAt: new Date().toISOString() },
    ...current.filter((repo) => repo.path !== info.path),
  ].slice(0, LIMIT);
  await store.set(KEY, next);
  await store.save();
}
