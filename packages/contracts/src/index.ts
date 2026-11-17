/** Códigos estables que el backend Rust serializa como `CODE|mensaje`. */
export type GitErrorCode = "NOT_A_REPO" | "IO_ERROR" | "NOT_IMPLEMENTED";

export interface RepositoryInfo {
  path: string;
  name: string;
  currentBranch: string | null;
  headSha: string | null;
  isDetached: boolean;
}

export interface BranchRef {
  name: string;
  /** `null` en ramas locales. En remotas, el nombre del remote (`origin`). */
  remote: string | null;
  isHead: boolean;
  tipSha: string | null;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentShas: string[];
}

export interface CommitPage {
  commits: CommitSummary[];
  nextCursor: string | null;
}

export type WorkingTreeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "typechange";

export interface WorkingTreeEntry {
  path: string;
  kind: WorkingTreeKind;
  staged: boolean;
}

export interface WorkingTreeStatus {
  entries: WorkingTreeEntry[];
}

export interface CommitDiffFile {
  path: string;
  oldPath: string | null;
  kind: WorkingTreeKind;
  patch: string;
}

export interface CommitDiff {
  sha: string;
  files: CommitDiffFile[];
  truncated: boolean;
}

export interface WorkDiff {
  path: string;
  staged: boolean;
  kind: string;
  before: string;
  after: string;
  patch: string;
  binary: boolean;
}

export interface CommitMessageDraft {
  summary: string;
  description: string;
}

export type CommitAgentId = "cursor" | "claude" | "codex";

export interface CommitMessageCandidate {
  provider: CommitAgentId;
  summary: string;
  description: string;
  error: string | null;
}

export interface CommitAuthor {
  name: string;
  email: string;
  detail: string;
  current: boolean;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string | null;
  stashedAt: string;
}

/**
 * Puerto de lectura git. La UI y el servidor MCP hablan esta forma;
 * la implementación de escritorio vive en Rust (`git2`).
 *
 * La terminal y el editor no pasan por este puerto.
 */
export interface GitPort {
  openRepository(path: string): Promise<RepositoryInfo>;
  listBranches(path: string): Promise<BranchRef[]>;
  listCommits(
    path: string,
    limit: number,
    cursor: string | null,
  ): Promise<CommitPage>;
  workingTreeStatus(path: string): Promise<WorkingTreeStatus>;
  workingTreeDiff(
    path: string,
    file: string,
    staged: boolean,
  ): Promise<WorkDiff>;
  commitDiff(path: string, sha: string): Promise<CommitDiff>;
  stagePaths(path: string, paths: string[]): Promise<void>;
  unstagePaths(path: string, paths: string[]): Promise<void>;
  discardPaths(path: string, paths: string[]): Promise<void>;
  createCommit(
    path: string,
    summary: string,
    description: string,
    authorName: string,
    authorEmail: string,
  ): Promise<void>;
  listCommitAuthors(path: string): Promise<CommitAuthor[]>;
  generateCommitMessage(
    path: string,
    providers: CommitAgentId[],
  ): Promise<CommitMessageCandidate[]>;
  checkoutBranch(path: string, name: string): Promise<void>;
  createBranch(path: string, name: string): Promise<void>;
  createBranchAt(path: string, name: string, sha: string): Promise<void>;
  deleteBranch(path: string, name: string): Promise<void>;
  renameBranch(path: string, name: string, nextName: string): Promise<void>;
  setUpstream(path: string, name: string, upstream: string): Promise<void>;
  createTag(
    path: string,
    sha: string,
    name: string,
    message: string,
  ): Promise<void>;
  checkoutCommit(path: string, sha: string): Promise<void>;
  fetch(path: string): Promise<void>;
  pull(path: string): Promise<void>;
  push(path: string): Promise<void>;
  cloneRepository(url: string, directory: string): Promise<RepositoryInfo>;
  initRepository(directory: string): Promise<RepositoryInfo>;
  readCommitFile(path: string, sha: string, file: string): Promise<string>;
  listStashes(path: string): Promise<StashEntry[]>;
  saveStash(
    path: string,
    message: string,
    includeUntracked: boolean,
  ): Promise<void>;
  applyStash(path: string, index: number): Promise<void>;
  popStash(path: string, index: number): Promise<void>;
  dropStash(path: string, index: number): Promise<void>;
}

export const SCRIPTS_FILE = ".githydra/scripts.json";
export const SCRIPT_NAME_LIMIT = 40;
export const SCRIPT_COMMAND_LIMIT = 500;
export const SCRIPT_PIN_LIMIT = 3;

export interface ProjectScripts {
  pinned: string[];
  scripts: Record<string, string>;
}

export function emptyScripts(): ProjectScripts {
  return { pinned: [], scripts: {} };
}

export function parseScripts(
  text: string,
): { book: ProjectScripts } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "scripts.json no es JSON válido." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "scripts.json tiene que ser un objeto." };
  }
  const record = raw as { pinned?: unknown; scripts?: unknown };
  if (
    !record.scripts ||
    typeof record.scripts !== "object" ||
    Array.isArray(record.scripts)
  ) {
    return { error: "Falta el objeto scripts." };
  }
  const scripts: Record<string, string> = {};
  for (const [name, command] of Object.entries(record.scripts)) {
    const problem = scriptProblem(name, command);
    if (problem) {
      return { error: problem };
    }
    scripts[name] = (command as string).trim();
  }
  if (!Array.isArray(record.pinned)) {
    return { error: "Falta la lista pinned." };
  }
  if (record.pinned.length > SCRIPT_PIN_LIMIT) {
    return { error: "Solo se pueden fijar tres scripts." };
  }
  const pinned: string[] = [];
  for (const name of record.pinned) {
    if (typeof name !== "string" || !hasKey(scripts, name)) {
      return { error: "Un script fijado no existe." };
    }
    if (!pinned.includes(name)) {
      pinned.push(name);
    }
  }
  return { book: { pinned, scripts } };
}

export function serializeScripts(book: ProjectScripts): string {
  const scripts: Record<string, string> = {};
  for (const name of Object.keys(book.scripts).sort()) {
    scripts[name] = book.scripts[name] ?? "";
  }
  return `${JSON.stringify({ pinned: book.pinned, scripts }, null, 2)}\n`;
}

function hasKey(record: Record<string, string>, name: string): boolean {
  return Object.keys(record).includes(name);
}

function hasControl(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

export function scriptProblem(name: string, command: unknown): string | null {
  if (
    name.trim() !== name ||
    name.length === 0 ||
    name.length > SCRIPT_NAME_LIMIT
  ) {
    return "El nombre del script no es válido.";
  }
  if (name.includes("/") || name.includes("\\") || hasControl(name)) {
    return "El nombre del script no es válido.";
  }
  if (typeof command !== "string") {
    return "El comando tiene que ser texto.";
  }
  const text = command.trim();
  if (
    text.length === 0 ||
    text.length > SCRIPT_COMMAND_LIMIT ||
    text.includes("\n") ||
    text.includes("\r") ||
    hasControl(text)
  ) {
    return "El comando tiene que ser una sola línea.";
  }
  return null;
}

export function putScript(
  book: ProjectScripts,
  name: string,
  command: string,
): { book: ProjectScripts } | { error: string } {
  const problem = scriptProblem(name, command);
  if (problem) {
    return { error: problem };
  }
  return {
    book: {
      pinned: book.pinned,
      scripts: { ...book.scripts, [name]: command.trim() },
    },
  };
}

export function removeScript(
  book: ProjectScripts,
  name: string,
): ProjectScripts {
  const scripts = { ...book.scripts };
  delete scripts[name];
  return {
    scripts,
    pinned: book.pinned.filter((item) => item !== name),
  };
}

export function pinScript(
  book: ProjectScripts,
  name: string,
  pinned: boolean,
): { book: ProjectScripts } | { error: string } {
  if (!hasKey(book.scripts, name)) {
    return { error: "Ese script no existe." };
  }
  const without = book.pinned.filter((item) => item !== name);
  if (!pinned) {
    return { book: { ...book, pinned: without } };
  }
  if (without.length >= SCRIPT_PIN_LIMIT) {
    return { error: "Solo se pueden fijar tres scripts." };
  }
  return { book: { ...book, pinned: [...without, name] } };
}

export function visiblePins(book: ProjectScripts): string[] {
  if (book.pinned.length > 0) {
    return book.pinned.filter((name) => hasKey(book.scripts, name));
  }
  return Object.keys(book.scripts).sort().slice(0, SCRIPT_PIN_LIMIT);
}
