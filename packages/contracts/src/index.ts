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
  createCommit(
    path: string,
    summary: string,
    description: string,
  ): Promise<void>;
  checkoutBranch(path: string, name: string): Promise<void>;
  createBranch(path: string, name: string): Promise<void>;
  createBranchAt(path: string, name: string, sha: string): Promise<void>;
  deleteBranch(path: string, name: string): Promise<void>;
  fetch(path: string): Promise<void>;
  pull(path: string): Promise<void>;
  push(path: string): Promise<void>;
  cloneRepository(url: string, directory: string): Promise<RepositoryInfo>;
  readCommitFile(path: string, sha: string, file: string): Promise<string>;
}
