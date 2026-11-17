import type {
  AddWorktreeRequest,
  BranchRef,
  CommitAuthor,
  CommitDiff,
  CommitMessageCandidate,
  CommitPage,
  CommitProposal,
  GitPort,
  LinkedWorktree,
  RepositoryInfo,
  ShowDiffRequest,
  StashEntry,
  WorkDiff,
  WorkingTreeStatus,
} from "@githydra/contracts";
import { invoke } from "@tauri-apps/api/core";

export const tauriGit: GitPort = {
  openRepository(path) {
    return invoke<RepositoryInfo>("open_repository", { path });
  },
  listBranches(path) {
    return invoke<BranchRef[]>("list_branches", { path });
  },
  listCommits(path, limit, cursor) {
    return invoke<CommitPage>("list_commits", { path, limit, cursor });
  },
  workingTreeStatus(path) {
    return invoke<WorkingTreeStatus>("working_tree_status", { path });
  },
  workingTreeDiff(path, file, staged) {
    return invoke<WorkDiff>("working_tree_diff", { path, file, staged });
  },
  commitDiff(path, sha) {
    return invoke<CommitDiff>("commit_diff", { path, sha });
  },
  stagePaths(path, paths) {
    return invoke<void>("stage_paths", { path, paths });
  },
  unstagePaths(path, paths) {
    return invoke<void>("unstage_paths", { path, paths });
  },
  discardPaths(path, paths) {
    return invoke<void>("discard_paths", { path, paths });
  },
  createCommit(path, summary, description, authorName, authorEmail) {
    return invoke<void>("create_commit", {
      path,
      summary,
      description,
      authorName,
      authorEmail,
    });
  },
  listCommitAuthors(path) {
    return invoke<CommitAuthor[]>("list_commit_authors", { path });
  },
  generateCommitMessage(path, providers) {
    return invoke<CommitMessageCandidate[]>("generate_commit_message", {
      path,
      providers,
    });
  },
  checkoutBranch(path, name) {
    return invoke<void>("checkout_branch", { path, name });
  },
  createBranch(path, name) {
    return invoke<void>("create_branch", { path, name });
  },
  createBranchAt(path, name, sha) {
    return invoke<void>("create_branch_at", { path, name, sha });
  },
  deleteBranch(path, name) {
    return invoke<void>("delete_branch", { path, name });
  },
  renameBranch(path, name, nextName) {
    return invoke<void>("rename_branch", { path, name, nextName });
  },
  setUpstream(path, name, upstream) {
    return invoke<void>("set_upstream", { path, name, upstream });
  },
  createTag(path, sha, name, message) {
    return invoke<void>("create_tag", { path, sha, name, message });
  },
  checkoutCommit(path, sha) {
    return invoke<void>("checkout_commit", { path, sha });
  },
  fetch(path) {
    return invoke<void>("fetch", { path });
  },
  pull(path) {
    return invoke<void>("pull", { path });
  },
  push(path) {
    return invoke<void>("push", { path });
  },
  cloneRepository(url, directory) {
    return invoke<RepositoryInfo>("clone_repository", { url, directory });
  },
  initRepository(directory) {
    return invoke<RepositoryInfo>("init_repository", { directory });
  },
  readCommitFile(path, sha, file) {
    return invoke<string>("read_commit_file", { path, sha, file });
  },
  listStashes(path) {
    return invoke<StashEntry[]>("list_stashes", { path });
  },
  saveStash(path, message, includeUntracked) {
    return invoke<void>("save_stash", { path, message, includeUntracked });
  },
  applyStash(path, index) {
    return invoke<void>("apply_stash", { path, index });
  },
  popStash(path, index) {
    return invoke<void>("pop_stash", { path, index });
  },
  dropStash(path, index) {
    return invoke<void>("drop_stash", { path, index });
  },
  listWorktrees(path) {
    return invoke<LinkedWorktree[]>("list_worktrees", { path });
  },
  readCommitProposal(path) {
    return invoke<CommitProposal | null>("read_commit_proposal", { path });
  },
  takeShowDiff(path) {
    return invoke<ShowDiffRequest | null>("take_show_diff", { path });
  },
  addWorktree(path, request: AddWorktreeRequest) {
    return invoke<RepositoryInfo>("add_worktree", {
      path,
      directory: request.directory,
      branch: request.branch,
      sha: request.sha,
      createBranch: request.createBranch,
    });
  },
  removeWorktree(path, worktreePath, force) {
    return invoke<void>("remove_worktree", { path, worktreePath, force });
  },
  unlockWorktree(path, worktreePath) {
    return invoke<void>("unlock_worktree", { path, worktreePath });
  },
  pruneWorktrees(path) {
    return invoke<void>("prune_worktrees", { path });
  },
};
