import {
  Code,
  Eye,
  Hash,
  Replace,
  Save,
  Search,
  TextWrap,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { readWorkdirFile, writeWorkdirFile } from "../../lib/workdir";
import { Explorer, type WorkdirChange } from "./Explorer";
import { FileGlyph } from "./FileGlyph";
import {
  eolOf,
  indentOf,
  languageLabel,
  languageOf,
  previewKind,
} from "./language";
import { MarkdownView } from "./MarkdownView";
import { MediaView, SvgView } from "./MediaView";
import type { MonacoEditor } from "./MonacoPane";
import {
  activateTab,
  applyText,
  cancelClose,
  classifyCommitText,
  closeTab,
  closeWorkPath,
  confirmDiscard,
  type EditorBuffer,
  type EditorSession,
  editText,
  fileName,
  isDirty,
  markSaved,
  pinTab,
  readSession,
  refreshIfClean,
  reloadBuffer,
  rememberSession,
  requestClose,
  requestOpen,
  retargetWorkPath,
  setBufferError,
  tabLabel,
} from "./session";

const MonacoPane = lazy(() => import("./MonacoPane"));

export function EditorPanel({
  path,
  revision,
  active,
  file,
  sha,
  requestId,
  onRepositoryChanged,
  indexed,
  indexReady,
  onRefreshIndex,
}: {
  path: string;
  revision: number;
  active: boolean;
  file: string | null;
  sha: string | null;
  requestId: number;
  onRepositoryChanged: () => Promise<void>;
  indexed: string[];
  indexReady: boolean;
  onRefreshIndex: () => void;
}) {
  const [session, setSession] = useState<EditorSession>(() =>
    readSession(path),
  );
  const [wordWrap, setWordWrap] = useState(false);
  const [viewMode, setViewMode] = useState<Record<string, "code" | "preview">>(
    {},
  );
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const sessionRef = useRef(session);
  const editorRef = useRef<MonacoEditor | null>(null);
  const editorFor = useRef<string | null>(null);
  const saving = useRef(false);
  const seenRevision = useRef(revision);
  sessionRef.current = session;

  const saveById = useCallback(
    async (id: string) => {
      const tab = sessionRef.current.tabs.find((item) => item.id === id);
      if (!tab || tab.readOnly || !tab.loaded || tab.binary || tab.truncated) {
        return false;
      }
      const text =
        editorFor.current === id && editorRef.current
          ? editorRef.current.getValue()
          : tab.text;
      if (text === tab.saved) {
        return true;
      }
      if (saving.current) {
        return false;
      }
      saving.current = true;
      try {
        await writeWorkdirFile(path, tab.path, text);
        setSession((current) => markSaved(current, id, text));
        await onRepositoryChanged().catch(() => undefined);
        return true;
      } catch (reason: unknown) {
        setSession((current) =>
          setBufferError(current, id, toGitClientError(reason).message),
        );
        return false;
      } finally {
        saving.current = false;
      }
    },
    [onRepositoryChanged, path],
  );

  useEffect(() => {
    rememberSession(path, session);
  }, [path, session]);

  useEffect(() => {
    if (!file || requestId === 0) {
      return;
    }
    setSession((current) => requestOpen(current, file, sha));
  }, [file, sha, requestId]);

  const pending = session.tabs
    .filter((tab) => !tab.loaded)
    .map((tab) => tab.id)
    .join("\n");

  useEffect(() => {
    const wanted = new Set(pending.split("\n").filter(Boolean));
    const tabs = sessionRef.current.tabs.filter((tab) => wanted.has(tab.id));
    if (tabs.length === 0) {
      return;
    }
    let cancelled = false;
    for (const tab of tabs) {
      const load = tab.sha
        ? tauriGit
            .readCommitFile(path, tab.sha, tab.path)
            .then((text) => classifyCommitText(text))
        : readWorkdirFile(path, tab.path).then((disk) => ({
            text: disk.text,
            binary: disk.binary,
            truncated: disk.truncated,
            error: null,
            mime: disk.mime,
            media: disk.media,
          }));
      load
        .then((next) => {
          if (!cancelled) {
            setSession((current) => applyText(current, tab.id, next));
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setSession((current) =>
              applyText(current, tab.id, {
                text: "",
                binary: false,
                truncated: false,
                error: toGitClientError(reason).message,
                mime: null,
                media: null,
              }),
            );
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [path, pending]);

  useEffect(() => {
    if (seenRevision.current === revision) {
      return;
    }
    seenRevision.current = revision;
    const tabs = sessionRef.current.tabs.filter(
      (tab) =>
        tab.loaded &&
        !tab.readOnly &&
        !isDirty(tab) &&
        !tab.binary &&
        !tab.truncated,
    );
    let cancelled = false;
    for (const tab of tabs) {
      readWorkdirFile(path, tab.path)
        .then((disk) => {
          if (!cancelled) {
            setSession((current) =>
              refreshIfClean(current, tab.id, {
                text: disk.text,
                binary: disk.binary,
                truncated: disk.truncated,
              }),
            );
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  useEffect(() => {
    if (!active) {
      return;
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "s" &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        const id = sessionRef.current.active;
        if (id) {
          void saveById(id);
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, saveById]);

  const tab = session.tabs.find((item) => item.id === session.active) ?? null;
  const activeId = tab?.id ?? null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (editorFor.current === activeId) {
        editorRef.current?.layout();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, activeId]);

  useEffect(() => {
    if (!activeId) {
      return;
    }
    setCursor({ line: 1, column: 1 });
  }, [activeId]);

  function openWork(filePath: string) {
    setSession((current) => requestOpen(current, filePath, null));
  }

  const handleTreeChange = useCallback(
    (change: WorkdirChange) => {
      if (change.kind === "rename") {
        setSession((current) =>
          retargetWorkPath(current, change.from, change.to),
        );
      } else if (change.kind === "remove") {
        setSession((current) => closeWorkPath(current, change.path));
      }
      void onRepositoryChanged().catch(() => undefined);
    },
    [onRepositoryChanged],
  );

  function runAction(action: string) {
    editorRef.current?.focus();
    editorRef.current?.trigger("githydra", action, null);
  }

  async function saveAndClose() {
    const id = sessionRef.current.pendingClose;
    if (!id) {
      return;
    }
    const saved = await saveById(id);
    if (!saved) {
      return;
    }
    setSession((current) => {
      const item = current.tabs.find((entry) => entry.id === id);
      if (!item || isDirty(item)) {
        return current;
      }
      return closeTab(current, id);
    });
  }

  const indent = indentOf(tab?.text ?? "");
  const preview = tab ? previewKind(tab.path) : null;
  const mode =
    tab === null
      ? "code"
      : (viewMode[tab.id] ?? (preview === "markdown" ? "preview" : "code"));
  const showingMedia = Boolean(tab?.media && tab.mime);
  const showingCode = !showingMedia && (preview === null || mode === "code");
  const editable = Boolean(
    tab?.loaded && !tab.error && !tab.binary && !tab.truncated && showingCode,
  );

  return (
    <div className="h-full min-h-0">
      <PanelGroup
        autoSaveId="githydra-editor"
        direction="horizontal"
        className="h-full"
      >
        <Panel defaultSize={24} minSize={14} maxSize={46} className="min-w-0">
          <Explorer
            path={path}
            revision={revision}
            activePath={tab?.path ?? null}
            onOpen={openWork}
            onChange={handleTreeChange}
            indexed={indexed}
            indexReady={indexReady}
            onRefreshIndex={onRefreshIndex}
          />
        </Panel>
        <PanelResizeHandle className="w-px bg-line" />
        <Panel className="min-w-0" minSize={30}>
          <section className="flex h-full min-h-0 min-w-0 flex-col">
            {session.tabs.length > 0 ? (
              <div
                className="flex h-8 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line px-1"
                role="tablist"
              >
                {session.tabs.map((item) => (
                  <FileTab
                    key={item.id}
                    session={session}
                    tab={item}
                    onActivate={() =>
                      setSession((current) => activateTab(current, item.id))
                    }
                    onPin={() =>
                      setSession((current) => pinTab(current, item.id))
                    }
                    onClose={() =>
                      setSession((current) => requestClose(current, item.id))
                    }
                  />
                ))}
              </div>
            ) : null}
            {session.pendingClose ? (
              <div className="flex items-center gap-2 border-b border-line bg-surface-overlay px-3 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  Hay cambios sin guardar en{" "}
                  {fileName(
                    session.tabs.find(
                      (item) => item.id === session.pendingClose,
                    )?.path ?? "",
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void saveAndClose();
                  }}
                  className="text-accent"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSession((current) => confirmDiscard(current))
                  }
                  className="text-warn"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => setSession((current) => cancelClose(current))}
                  className="text-muted"
                >
                  Seguir
                </button>
              </div>
            ) : null}
            {tab ? (
              <>
                {tab.readOnly ? (
                  <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-[11px] text-muted">
                    <span className="min-w-0 flex-1 truncate">
                      Solo lectura · commit {tab.sha?.slice(0, 7)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openWork(tab.path)}
                      className="text-accent"
                    >
                      Editar en el árbol
                    </button>
                  </div>
                ) : null}
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
                  <nav className="flex min-w-0 flex-1 items-center overflow-hidden font-mono text-[11px] text-muted">
                    {tab.path.split("/").map((part, index, parts) => (
                      <span
                        key={parts.slice(0, index + 1).join("/")}
                        className={
                          index === parts.length - 1
                            ? "truncate text-text"
                            : "shrink-0"
                        }
                      >
                        {index > 0 ? (
                          <span className="px-0.5 text-muted">/</span>
                        ) : null}
                        {part}
                      </span>
                    ))}
                  </nav>
                  {preview && !showingMedia ? (
                    <IconButton
                      label={mode === "preview" ? "Ver código" : "Ver vista"}
                      onClick={() => {
                        const next = mode === "preview" ? "code" : "preview";
                        setViewMode((current) => ({
                          ...current,
                          [tab.id]: next,
                        }));
                      }}
                    >
                      {mode === "preview" ? (
                        <Code size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </IconButton>
                  ) : null}
                  <IconButton
                    label="Buscar"
                    disabled={!editable}
                    onClick={() => runAction("actions.find")}
                  >
                    <Search size={14} />
                  </IconButton>
                  <IconButton
                    label="Reemplazar"
                    disabled={!editable || tab.readOnly}
                    onClick={() =>
                      runAction("editor.action.startFindReplaceAction")
                    }
                  >
                    <Replace size={14} />
                  </IconButton>
                  <IconButton
                    label="Ir a la línea"
                    disabled={!editable}
                    onClick={() => runAction("editor.action.gotoLine")}
                  >
                    <Hash size={14} />
                  </IconButton>
                  <IconButton
                    label={
                      wordWrap ? "Quitar ajuste de línea" : "Ajustar línea"
                    }
                    disabled={!editable}
                    onClick={() => setWordWrap((current) => !current)}
                  >
                    <TextWrap size={14} />
                  </IconButton>
                  <IconButton
                    label="Guardar"
                    disabled={!tab || tab.readOnly || !isDirty(tab)}
                    onClick={() => {
                      if (tab) {
                        void saveById(tab.id);
                      }
                    }}
                  >
                    <Save size={14} />
                  </IconButton>
                </div>
                <div className="min-h-0 flex-1">
                  <BufferBody
                    tab={tab}
                    preview={preview}
                    mode={mode}
                    wordWrap={wordWrap}
                    indent={indent}
                    onChange={(text) =>
                      setSession((current) => editText(current, tab.id, text))
                    }
                    onReady={(editor) => {
                      if (editor) {
                        editorRef.current = editor;
                        editorFor.current = tab.id;
                        return;
                      }
                      if (editorFor.current === tab.id) {
                        editorRef.current = null;
                        editorFor.current = null;
                      }
                    }}
                    onCursor={setCursor}
                    onRetry={() =>
                      setSession((current) => reloadBuffer(current, tab.id))
                    }
                  />
                </div>
                <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-surface-raised px-3 font-mono text-[11px] text-muted">
                  <span className={isDirty(tab) ? "text-accent" : ""}>
                    {isDirty(tab)
                      ? "Cambios sin guardar"
                      : tab.readOnly
                        ? "Solo lectura"
                        : "En disco"}
                  </span>
                  <span className="ml-auto">
                    Ln {cursor.line}, Col {cursor.column}
                  </span>
                  <span>{indent.label}</span>
                  <span>{eolOf(tab.text)}</span>
                  <span>UTF-8</span>
                  <span>{languageLabel(languageOf(tab.path))}</span>
                  <button
                    type="button"
                    onClick={() => setWordWrap((current) => !current)}
                    className={wordWrap ? "text-text" : ""}
                  >
                    {wordWrap ? "Ajustado" : "Sin ajuste"}
                  </button>
                </footer>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm">Editor</p>
                <p className="max-w-sm text-xs text-muted">
                  Abre un archivo del explorador para verlo y cambiarlo. ⌘S o
                  Ctrl+S guarda. Desde un commit, el archivo se abre en solo
                  lectura hasta que eliges editar la copia de trabajo.
                </p>
              </div>
            )}
          </section>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function FileTab({
  session,
  tab,
  onActivate,
  onPin,
  onClose,
}: {
  session: EditorSession;
  tab: EditorBuffer;
  onActivate: () => void;
  onPin: () => void;
  onClose: () => void;
}) {
  const active = session.active === tab.id;
  const label = tabLabel(session, tab);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  }
  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={active}
      title={
        tab.preview
          ? `${tab.path} · doble clic para conservar la pestaña`
          : tab.path
      }
      onClick={onActivate}
      onDoubleClick={onPin}
      onKeyDown={onKeyDown}
      className={`group flex h-7 max-w-44 shrink-0 select-none items-center gap-1 rounded-t border border-b-0 px-2 text-xs ${
        active
          ? "border-line bg-surface text-text"
          : "border-transparent text-muted hover:text-text"
      } ${tab.preview ? "italic" : ""}`}
    >
      {isDirty(tab) ? (
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
      ) : null}
      <FileGlyph path={tab.path} kind="file" />
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Cerrar ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={`rounded p-0.5 text-muted hover:bg-surface-overlay hover:text-text ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function BufferBody({
  tab,
  preview,
  mode,
  wordWrap,
  indent,
  onChange,
  onReady,
  onCursor,
  onRetry,
}: {
  tab: EditorBuffer;
  preview: "markdown" | "svg" | null;
  mode: "code" | "preview";
  wordWrap: boolean;
  indent: { tabSize: number; insertSpaces: boolean };
  onChange: (text: string) => void;
  onReady: (editor: MonacoEditor | null) => void;
  onCursor: (cursor: { line: number; column: number }) => void;
  onRetry: () => void;
}) {
  if (!tab.loaded) {
    return <p className="p-3 text-xs text-muted">Abriendo…</p>;
  }
  if (tab.error) {
    return (
      <div className="p-3">
        <p className="text-xs text-warn">{tab.error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs text-accent"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (tab.media && tab.mime) {
    return <MediaView path={tab.path} mime={tab.mime} media={tab.media} />;
  }
  if (tab.binary) {
    return (
      <p className="p-3 text-xs text-muted">
        Archivo binario. El editor abre texto, imágenes y PDF.
      </p>
    );
  }
  if (preview === "markdown" && mode === "preview") {
    return <MarkdownView text={tab.text} />;
  }
  if (preview === "svg" && mode === "preview") {
    return <SvgView text={tab.text} />;
  }
  if (tab.truncated) {
    return (
      <p className="p-3 text-xs text-muted">
        El archivo es demasiado grande para abrirlo aquí.
      </p>
    );
  }
  return (
    <Suspense
      fallback={<p className="p-3 text-xs text-muted">Cargando editor…</p>}
    >
      <MonacoPane
        key={`${tab.id}:${tab.generation}`}
        initialValue={tab.text}
        language={languageOf(tab.path)}
        readOnly={tab.readOnly}
        wordWrap={wordWrap}
        tabSize={indent.tabSize}
        insertSpaces={indent.insertSpaces}
        onChange={onChange}
        onReady={onReady}
        onCursor={onCursor}
      />
    </Suspense>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted hover:bg-surface-overlay hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}
