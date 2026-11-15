export interface EditorBuffer {
  id: string;
  path: string;
  sha: string | null;
  text: string;
  saved: string;
  loaded: boolean;
  readOnly: boolean;
  binary: boolean;
  truncated: boolean;
  error: string | null;
  generation: number;
  preview: boolean;
  mime: string | null;
  media: string | null;
}

export interface EditorSession {
  tabs: EditorBuffer[];
  active: string | null;
  pendingClose: string | null;
}

export interface DiskText {
  text: string;
  binary: boolean;
  truncated: boolean;
  error: string | null;
  mime: string | null;
  media: string | null;
}

const memory = new Map<string, EditorSession>();

export function emptySession(): EditorSession {
  return { tabs: [], active: null, pendingClose: null };
}

export function readSession(repo: string): EditorSession {
  return memory.get(repo) ?? emptySession();
}

export function rememberSession(repo: string, session: EditorSession): void {
  memory.set(repo, session);
}

export function bufferId(path: string, sha: string | null): string {
  return sha ? `commit:${sha}:${path}` : `work:${path}`;
}

export function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function tabLabel(session: EditorSession, tab: EditorBuffer): string {
  const name = fileName(tab.path);
  const clash = session.tabs.some(
    (other) => other.id !== tab.id && fileName(other.path) === name,
  );
  if (!clash) {
    return name;
  }
  const parts = tab.path.split("/");
  return parts.slice(-2).join("/");
}

export function isDirty(tab: EditorBuffer): boolean {
  return (
    tab.loaded &&
    !tab.readOnly &&
    !tab.binary &&
    !tab.truncated &&
    tab.text !== tab.saved
  );
}

export function requestOpen(
  session: EditorSession,
  path: string,
  sha: string | null,
): EditorSession {
  const id = bufferId(path, sha);
  if (session.tabs.some((tab) => tab.id === id)) {
    return { ...session, active: id, pendingClose: null };
  }
  const preview = sha !== null;
  const tabs = preview
    ? session.tabs.filter((tab) => !tab.preview)
    : session.tabs;
  return {
    tabs: [
      ...tabs,
      {
        id,
        path,
        sha,
        text: "",
        saved: "",
        loaded: false,
        readOnly: preview,
        binary: false,
        truncated: false,
        error: null,
        generation: 0,
        preview,
        mime: null,
        media: null,
      },
    ],
    active: id,
    pendingClose: null,
  };
}

export function activateTab(session: EditorSession, id: string): EditorSession {
  if (!session.tabs.some((tab) => tab.id === id)) {
    return session;
  }
  return { ...session, active: id, pendingClose: null };
}

export function pinTab(session: EditorSession, id: string): EditorSession {
  return {
    ...session,
    tabs: session.tabs.map((tab) =>
      tab.id === id ? { ...tab, preview: false } : tab,
    ),
  };
}

export function applyText(
  session: EditorSession,
  id: string,
  next: DiskText,
): EditorSession {
  const tab = session.tabs.find((item) => item.id === id);
  if (!tab || tab.loaded) {
    return session;
  }
  const blocked = next.error !== null || next.binary || next.truncated;
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id
        ? {
            ...item,
            text: blocked ? "" : next.text,
            saved: blocked ? "" : next.text,
            loaded: true,
            binary: next.binary,
            truncated: next.truncated,
            error: next.error,
            mime: next.mime,
            media: next.media,
          }
        : item,
    ),
  };
}

export function editText(
  session: EditorSession,
  id: string,
  text: string,
): EditorSession {
  const tab = session.tabs.find((item) => item.id === id);
  if (
    !tab ||
    tab.readOnly ||
    !tab.loaded ||
    tab.binary ||
    tab.truncated ||
    tab.text === text
  ) {
    return session;
  }
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id ? { ...item, text, error: null } : item,
    ),
  };
}

export function markSaved(
  session: EditorSession,
  id: string,
  text: string,
): EditorSession {
  const tab = session.tabs.find((item) => item.id === id);
  if (!tab || (tab.text === text && tab.saved === text && tab.error === null)) {
    return session;
  }
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id ? { ...item, text, saved: text, error: null } : item,
    ),
  };
}

export function setBufferError(
  session: EditorSession,
  id: string,
  error: string,
): EditorSession {
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id ? { ...item, error } : item,
    ),
  };
}

export function reloadBuffer(
  session: EditorSession,
  id: string,
): EditorSession {
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id ? { ...item, loaded: false, error: null } : item,
    ),
  };
}

export function refreshIfClean(
  session: EditorSession,
  id: string,
  next: { text: string; binary: boolean; truncated: boolean },
): EditorSession {
  const tab = session.tabs.find((item) => item.id === id);
  if (!tab?.loaded || tab.readOnly || isDirty(tab)) {
    return session;
  }
  if (
    tab.text === next.text &&
    tab.binary === next.binary &&
    tab.truncated === next.truncated
  ) {
    return session;
  }
  const blocked = next.binary || next.truncated;
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === id
        ? {
            ...item,
            text: blocked ? "" : next.text,
            saved: blocked ? "" : next.text,
            binary: next.binary,
            truncated: next.truncated,
            error: null,
            generation: item.generation + 1,
          }
        : item,
    ),
  };
}

export function requestClose(
  session: EditorSession,
  id: string,
): EditorSession {
  const tab = session.tabs.find((item) => item.id === id);
  if (!tab) {
    return session;
  }
  if (isDirty(tab)) {
    return { ...session, active: id, pendingClose: id };
  }
  return closeTab(session, id);
}

export function cancelClose(session: EditorSession): EditorSession {
  if (!session.pendingClose) {
    return session;
  }
  return { ...session, pendingClose: null };
}

export function confirmDiscard(session: EditorSession): EditorSession {
  if (!session.pendingClose) {
    return session;
  }
  return closeTab(session, session.pendingClose);
}

export function closeTab(session: EditorSession, id: string): EditorSession {
  const index = session.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) {
    return session;
  }
  const tabs = session.tabs.filter((tab) => tab.id !== id);
  const active =
    session.active === id
      ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? null)
      : session.active;
  return {
    tabs,
    active,
    pendingClose: session.pendingClose === id ? null : session.pendingClose,
  };
}

function disk(text: string, error: string | null = null): DiskText {
  return {
    text,
    binary: false,
    truncated: false,
    error,
    mime: null,
    media: null,
  };
}

export function classifyCommitText(text: string): DiskText {
  const trimmed = text.trim();
  if (trimmed.startsWith("Archivo binario")) {
    return { ...disk(""), binary: true };
  }
  if (trimmed.startsWith("El archivo supera")) {
    return { ...disk(""), truncated: true };
  }
  if (
    trimmed.startsWith("El commit no tiene") ||
    trimmed.startsWith("No se puede mostrar")
  ) {
    return disk("", trimmed);
  }
  return disk(text);
}
