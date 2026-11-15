import type {
  BranchRef,
  CommitDiff,
  CommitPage,
  GitPort,
  RepositoryInfo,
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
  deleteBranch(path, name) {
    return invoke<void>("delete_branch", { path, name });
  },
};
