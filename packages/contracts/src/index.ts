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

/**
 * Puerto de lectura git. La UI y el servidor MCP hablan esta forma;
 * la implementación de escritorio vive en Rust (`git2`).
 *
 * Mutaciones que siguen fuera: fetch, pull, push y clonar.
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
  deleteBranch(path: string, name: string): Promise<void>;
}
