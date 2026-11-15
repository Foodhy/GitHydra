import { invoke } from "@tauri-apps/api/core";

export interface WorkdirEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
}

export interface WorkdirFile {
  path: string;
  text: string;
  binary: boolean;
  truncated: boolean;
  mime: string | null;
  media: string | null;
}

export function listWorkdir(
  path: string,
  directory: string,
): Promise<WorkdirEntry[]> {
  return invoke<WorkdirEntry[]>("list_workdir", { path, directory });
}

export function readWorkdirFile(
  path: string,
  file: string,
): Promise<WorkdirFile> {
  return invoke<WorkdirFile>("read_workdir_file", { path, file });
}

export function writeWorkdirFile(
  path: string,
  file: string,
  contents: string,
): Promise<void> {
  return invoke<void>("write_workdir_file", { path, file, contents });
}

export function searchWorkdir(path: string, query: string): Promise<string[]> {
  return invoke<string[]>("search_workdir", { path, query });
}
