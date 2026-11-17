export interface RepoTab {
  id: string;
  path: string | null;
  name: string;
}

export interface TabState {
  tabs: RepoTab[];
  activeId: string | null;
  closed: string[];
}

const CLOSED_LIMIT = 20;

export function tabName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function worktreeTabName(
  entry: { path: string; branch: string | null; isDetached: boolean },
  copies: { path: string }[],
): string {
  const base = tabName(entry.path);
  const collision = copies.some(
    (other) => other.path !== entry.path && tabName(other.path) === base,
  );
  if (!collision) {
    return base;
  }
  if (!entry.isDetached && entry.branch) {
    return `${base} · ${entry.branch}`;
  }
  const parts = entry.path.split("/").filter(Boolean);
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  return parent ? `${parent}/${base}` : base;
}

export function renamePath(
  state: TabState,
  path: string,
  name: string,
): TabState {
  if (!state.tabs.some((tab) => tab.path === path && tab.name !== name)) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, name } : tab)),
  };
}

export function initialTabs(): TabState {
  return {
    tabs: [{ id: "inicio", path: null, name: "Inicio" }],
    activeId: "inicio",
    closed: [],
  };
}

export function activePath(state: TabState): string | null {
  return state.tabs.find((tab) => tab.id === state.activeId)?.path ?? null;
}

export function newTab(state: TabState, id: string): TabState {
  const tab: RepoTab = { id, path: null, name: "Nuevo" };
  return { ...state, tabs: [...state.tabs, tab], activeId: id };
}

export function openPath(
  state: TabState,
  path: string,
  name: string,
  id: string,
): TabState {
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing) {
    return { ...state, activeId: existing.id };
  }
  const active = state.tabs.find((tab) => tab.id === state.activeId);
  if (active?.path === null) {
    return fill(state, active.id, path, name);
  }
  if (!active) {
    const empty = state.tabs.find((tab) => tab.path === null);
    if (empty) {
      return fill(state, empty.id, path, name);
    }
  }
  const tab: RepoTab = { id, path, name };
  return { ...state, tabs: [...state.tabs, tab], activeId: id };
}

export function closeTab(
  state: TabState,
  id: string,
  nextId: string,
): TabState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  const current = state.tabs[index];
  if (!current) {
    return state;
  }
  const closed = current.path
    ? [
        current.path,
        ...state.closed.filter((item) => item !== current.path),
      ].slice(0, CLOSED_LIMIT)
    : state.closed;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (tabs.length === 0) {
    const fresh: RepoTab = { id: nextId, path: null, name: "Inicio" };
    return { tabs: [fresh], activeId: fresh.id, closed };
  }
  const activeId =
    state.activeId === id
      ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
      : state.activeId;
  return { tabs, activeId, closed };
}

export function reopenClosed(state: TabState, id: string): TabState {
  const path = state.closed[0];
  if (!path) {
    return state;
  }
  return openPath(
    { ...state, closed: state.closed.slice(1) },
    path,
    tabName(path),
    id,
  );
}

export function activate(state: TabState, id: string): TabState {
  if (!state.tabs.some((tab) => tab.id === id)) {
    return state;
  }
  return { ...state, activeId: id };
}

export function showManagement(state: TabState): TabState {
  return { ...state, activeId: null };
}

function fill(
  state: TabState,
  id: string,
  path: string,
  name: string,
): TabState {
  return {
    ...state,
    activeId: id,
    tabs: state.tabs.map((tab) =>
      tab.id === id ? { ...tab, path, name } : tab,
    ),
  };
}
