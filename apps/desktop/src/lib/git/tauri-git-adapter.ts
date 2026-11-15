import type {
  BranchRef,
  CommitDiff,
  CommitPage,
  GitPort,
  RepositoryInfo,
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
  createCommit(path, summary, description) {
    return invoke<void>("create_commit", { path, summary, description });
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
  readCommitFile(path, sha, file) {
    return invoke<string>("read_commit_file", { path, sha, file });
  },
};
