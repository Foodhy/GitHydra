import type { RepositoryInfo } from "@githydra/contracts";
import { create } from "zustand";

interface RepoSession {
  info: RepositoryInfo | null;
  setInfo: (info: RepositoryInfo | null) => void;
}

export const useRepoSession = create<RepoSession>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));
