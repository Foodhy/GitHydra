import { create } from "zustand";

interface CommandUi {
  cloneOpen: boolean;
  notice: string | null;
  quickOpen: boolean;
  quickOpenTick: number;
  openClone: () => void;
  closeClone: () => void;
  setNotice: (notice: string | null) => void;
  showQuickOpen: () => void;
  hideQuickOpen: () => void;
}

export const useCommandUi = create<CommandUi>((set) => ({
  cloneOpen: false,
  notice: null,
  quickOpen: false,
  quickOpenTick: 0,
  openClone: () => set({ cloneOpen: true, notice: null }),
  closeClone: () => set({ cloneOpen: false }),
  setNotice: (notice) => set({ notice }),
  showQuickOpen: () =>
    set((state) => ({
      quickOpen: true,
      quickOpenTick: state.quickOpenTick + 1,
    })),
  hideQuickOpen: () => set({ quickOpen: false }),
}));
