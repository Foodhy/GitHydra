import type { RepositoryInfo } from "@githydra/contracts";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCommandUi } from "../stores/command-ui";
import { useRepoSession } from "../stores/repo-session";
import { useRepoTabs } from "../stores/repo-tabs";
import { readExternalApps } from "./external-apps";
import { toGitClientError } from "./git/errors";
import { tauriGit } from "./git/tauri-git-adapter";
import { rememberRecent } from "./recents";

let navigateTo: ((path: string | null) => void) | null = null;

export function bindRepoNavigation(
  navigate: (path: string | null) => void,
): () => void {
  navigateTo = navigate;
  return () => {
    if (navigateTo === navigate) {
      navigateTo = null;
    }
  };
}

export function showPath(path: string | null): void {
  navigateTo?.(path);
}

export async function adoptRepository(repo: RepositoryInfo): Promise<void> {
  await rememberRecent(repo);
  useRepoSession.getState().setInfo(repo);
  useRepoTabs.getState().openPath(repo.path, repo.name);
  showPath(repo.path);
}

export function openNewTab(): void {
  useRepoTabs.getState().newTab();
  showPath(null);
}

export function closeRepoTab(id?: string): void {
  const tabs = useRepoTabs.getState();
  const target = id ?? tabs.activeId;
  if (!target) {
    return;
  }
  const wasActive = tabs.activeId === target;
  tabs.close(target);
  if (wasActive) {
    showPath(useRepoTabs.getState().activePath());
  }
}

export function reopenClosedTab(): void {
  const path = useRepoTabs.getState().reopen();
  if (path) {
    showPath(path);
  }
}

export function focusRepoTab(id: string): void {
  useRepoTabs.getState().activate(id);
  showPath(useRepoTabs.getState().activePath());
}

export function showRepoManagement(): void {
  useRepoTabs.getState().showManagement();
  showPath(null);
}

export async function openChosenFolder(): Promise<void> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Abrir repositorio",
  });
  if (typeof selected !== "string") {
    return;
  }
  const repo = await tauriGit.openRepository(selected);
  await adoptRepository(repo);
}

export async function initChosenFolder(): Promise<void> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Iniciar repositorio",
  });
  if (typeof selected !== "string") {
    return;
  }
  const repo = await tauriGit.initRepository(selected);
  await adoptRepository(repo);
}

export async function cloneRepository(
  url: string,
  directory: string,
): Promise<void> {
  const repo = await tauriGit.cloneRepository(url, directory);
  await adoptRepository(repo);
}

export async function openActiveInEditor(): Promise<void> {
  const path = useRepoTabs.getState().activePath();
  if (!path) {
    return;
  }
  const apps = await readExternalApps();
  await openPath(path, apps.editor);
}

export async function openActiveInTerminal(): Promise<void> {
  const path = useRepoTabs.getState().activePath();
  if (!path) {
    return;
  }
  const apps = await readExternalApps();
  await openPath(path, apps.terminal);
}

export async function revealActiveRepo(): Promise<void> {
  const path = useRepoTabs.getState().activePath();
  if (!path) {
    return;
  }
  await revealItemInDir(path);
}

export function reportCommandError(reason: unknown): void {
  useCommandUi.getState().setNotice(toGitClientError(reason).message);
}
