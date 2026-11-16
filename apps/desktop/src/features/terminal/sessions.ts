import type { DockStorage } from "./dock.ts";

export const TERMINAL_KEY = "githydra.terminals";
export const TERMINAL_LIMIT = 6;

export const TERMINAL_COLORS = [
  "#3ee0b0",
  "#7aa2f7",
  "#e0af68",
  "#f7768e",
  "#bb9af7",
  "#9ece6a",
  "#7dcfff",
  "#c0caf5",
] as const;

export interface TerminalTab {
  id: string;
  name: string;
  color: string;
}

type Book = Record<string, TerminalTab[]>;

export function terminalName(index: number): string {
  return index <= 0 ? "Terminal" : `Terminal ${index + 1}`;
}

export function createTerminal(
  id: string,
  index: number,
  color: string = TERMINAL_COLORS[index % TERMINAL_COLORS.length] ??
    TERMINAL_COLORS[0],
): TerminalTab {
  return { id, name: terminalName(index), color };
}

export function addTerminal(
  tabs: readonly TerminalTab[],
  tab: TerminalTab,
): TerminalTab[] {
  if (tabs.length >= TERMINAL_LIMIT) {
    return [...tabs];
  }
  return [...tabs, tab];
}

export function renameTerminal(
  tabs: readonly TerminalTab[],
  id: string,
  name: string,
): TerminalTab[] {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) {
    return [...tabs];
  }
  return tabs.map((tab) => (tab.id === id ? { ...tab, name: clean } : tab));
}

export function recolorTerminal(
  tabs: readonly TerminalTab[],
  id: string,
  color: string,
): TerminalTab[] {
  if (!TERMINAL_COLORS.some((item) => item === color)) {
    return [...tabs];
  }
  return tabs.map((tab) => (tab.id === id ? { ...tab, color } : tab));
}

export function closeTerminal(
  tabs: readonly TerminalTab[],
  id: string,
): TerminalTab[] {
  return tabs.filter((tab) => tab.id !== id);
}

export function loadTerminals(
  storage: DockStorage,
  path: string,
): TerminalTab[] {
  const book = readBook(storage.getItem(TERMINAL_KEY));
  const saved = book[path];
  if (!saved) {
    return [createTerminal("1", 0)];
  }
  return saved.slice(0, TERMINAL_LIMIT);
}

export function saveTerminals(
  storage: DockStorage,
  path: string,
  tabs: readonly TerminalTab[],
): void {
  const book = readBook(storage.getItem(TERMINAL_KEY));
  book[path] = tabs.slice(0, TERMINAL_LIMIT).map(normalize);
  storage.setItem(TERMINAL_KEY, JSON.stringify(book));
}

function readBook(raw: string | null): Book {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const book: Book = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) {
        continue;
      }
      book[path] = value.flatMap((item) => {
        const tab = normalizeUnknown(item);
        return tab ? [tab] : [];
      });
    }
    return book;
  } catch {
    return {};
  }
}

function normalize(tab: TerminalTab): TerminalTab {
  return normalizeUnknown(tab) ?? createTerminal("1", 0);
}

function normalizeUnknown(value: unknown): TerminalTab | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { id?: unknown; name?: unknown; color?: unknown };
  if (
    typeof record.id !== "string" ||
    !/^[A-Za-z0-9-]{1,40}$/.test(record.id)
  ) {
    return null;
  }
  const name =
    typeof record.name === "string"
      ? record.name.trim().replace(/\s+/g, " ").slice(0, 40)
      : "";
  const color =
    typeof record.color === "string" &&
    TERMINAL_COLORS.some((item) => item === record.color)
      ? record.color
      : TERMINAL_COLORS[0];
  return { id: record.id, name: name || "Terminal", color };
}
