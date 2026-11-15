import { create } from "zustand";

interface CommandUi {
  cloneOpen: boolean;
  notice: string | null;
  openClone: () => void;
  closeClone: () => void;
  setNotice: (notice: string | null) => void;
}

export const useCommandUi = create<CommandUi>((set) => ({
  cloneOpen: false,
  notice: null,
  openClone: () => set({ cloneOpen: true, notice: null }),
  closeClone: () => set({ cloneOpen: false }),
  setNotice: (notice) => set({ notice }),
}));
