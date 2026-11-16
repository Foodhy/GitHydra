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

export function createWorkdirFile(
  path: string,
  directory: string,
  name: string,
): Promise<string> {
  return invoke<string>("create_workdir_file", { path, directory, name });
}

export function createWorkdirDir(
  path: string,
  directory: string,
  name: string,
): Promise<string> {
  return invoke<string>("create_workdir_dir", { path, directory, name });
}

export function renameWorkdir(
  path: string,
  file: string,
  name: string,
): Promise<string> {
  return invoke<string>("rename_workdir", { path, file, name });
}

export function removeWorkdir(path: string, file: string): Promise<void> {
  return invoke<void>("remove_workdir", { path, file });
}
