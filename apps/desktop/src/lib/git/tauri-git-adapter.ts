import type {
  BranchRef,
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
};
