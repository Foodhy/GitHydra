export const TERMINAL_DOCKS = [
  "bottom",
  "top",
  "left",
  "right",
  "center",
] as const;

export type TerminalDock = (typeof TERMINAL_DOCKS)[number];

export const TERMINAL_DOCK_KEY = "githydra.terminalDock";

export const terminalDockLabel: Record<TerminalDock, string> = {
  bottom: "Abajo",
  top: "Arriba",
  left: "Izquierda",
  right: "Derecha",
  center: "Centro",
};

export interface DockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseTerminalDock(
  value: string | null | undefined,
): TerminalDock {
  if (
    value === "bottom" ||
    value === "top" ||
    value === "left" ||
    value === "right" ||
    value === "center"
  ) {
    return value;
  }
  return "bottom";
}

export function readTerminalDock(storage: DockStorage): TerminalDock {
  return parseTerminalDock(storage.getItem(TERMINAL_DOCK_KEY));
}

export function writeTerminalDock(
  storage: DockStorage,
  dock: TerminalDock,
): void {
  storage.setItem(TERMINAL_DOCK_KEY, dock);
}
