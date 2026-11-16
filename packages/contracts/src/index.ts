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
