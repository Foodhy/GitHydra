import { load } from "@tauri-apps/plugin-store";

const FILE = "session.json";
const KEY = "path";

export async function rememberOpenRepo(path: string): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set(KEY, path);
  await store.save();
}

export async function clearOpenRepo(): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.delete(KEY);
  await store.save();
}
