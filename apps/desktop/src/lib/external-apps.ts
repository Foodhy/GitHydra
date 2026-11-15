import { load } from "@tauri-apps/plugin-store";

export interface ExternalApps {
  editor: string;
  terminal: string;
}

const FILE = "tools.json";
const DEFAULTS: ExternalApps = {
  editor: "Cursor",
  terminal: "Terminal",
};

export async function readExternalApps(): Promise<ExternalApps> {
  try {
    const store = await load(FILE, { autoSave: false, defaults: {} });
    const editor =
      (await store.get<string>("editor"))?.trim() || DEFAULTS.editor;
    const terminal =
      (await store.get<string>("terminal"))?.trim() || DEFAULTS.terminal;
    return { editor, terminal };
  } catch {
    return DEFAULTS;
  }
}

export async function saveExternalApps(apps: ExternalApps): Promise<void> {
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("editor", apps.editor.trim() || DEFAULTS.editor);
  await store.set("terminal", apps.terminal.trim() || DEFAULTS.terminal);
  await store.save();
}
