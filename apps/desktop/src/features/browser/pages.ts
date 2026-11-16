import { browserTabLabel } from "./label";

export const BROWSER_PAGE_LIMIT = 8;

export interface BrowserPage {
  id: string;
  url: string | null;
  title: string | null;
  live: boolean;
}

interface BrowserPages {
  pages: BrowserPage[];
  activeId: string;
  next: number;
}

const listeners = new Set<() => void>();

let state: BrowserPages = fresh();

function fresh(): BrowserPages {
  return {
    pages: [{ id: "1", url: null, title: null, live: false }],
    activeId: "1",
    next: 2,
  };
}

function publish(next: BrowserPages) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeBrowserPages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readBrowserPages(): BrowserPages {
  return state;
}

export function activeBrowserLabel(): string {
  const page =
    state.pages.find((item) => item.id === state.activeId) ?? state.pages[0];
  return browserTabLabel(page?.url ?? null, page?.title ?? null);
}

export function openBrowserPage(select = true): string | null {
  if (state.pages.length >= BROWSER_PAGE_LIMIT) {
    return null;
  }
  const id = String(state.next);
  publish({
    pages: [...state.pages, { id, url: null, title: null, live: false }],
    activeId: select ? id : state.activeId,
    next: state.next + 1,
  });
  return id;
}

export function selectBrowserPage(id: string): void {
  if (!state.pages.some((page) => page.id === id) || state.activeId === id) {
    return;
  }
  publish({ ...state, activeId: id });
}

export function closeBrowserPage(id: string): void {
  const pages = state.pages.filter((page) => page.id !== id);
  if (pages.length === state.pages.length) {
    return;
  }
  if (pages.length === 0) {
    const blank = String(state.next);
    publish({
      pages: [{ id: blank, url: null, title: null, live: false }],
      activeId: blank,
      next: state.next + 1,
    });
    return;
  }
  const activeId = pages.some((page) => page.id === state.activeId)
    ? state.activeId
    : pages[pages.length - 1].id;
  publish({ ...state, pages, activeId });
}

export function rememberBrowserUrl(id: string, url: string): void {
  publish({
    ...state,
    pages: state.pages.map((page) =>
      page.id === id ? { ...page, url, live: true } : page,
    ),
  });
}

export function rememberBrowserTitle(id: string, title: string): void {
  const clean = title.trim();
  if (!clean) {
    return;
  }
  publish({
    ...state,
    pages: state.pages.map((page) =>
      page.id === id ? { ...page, title: clean } : page,
    ),
  });
}

export function markBrowserClosed(): void {
  publish({
    ...state,
    pages: state.pages.map((page) => ({ ...page, live: false })),
  });
}

export function clearBrowserPage(): void {
  publish(fresh());
}
