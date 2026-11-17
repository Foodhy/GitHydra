import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FilePlus,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import {
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useWorkingTree } from "../../hooks/useWorkingTree";
import { toGitClientError } from "../../lib/git/errors";
import {
  createWorkdirDir,
  createWorkdirFile,
  listWorkdir,
  moveWorkdir,
  removeWorkdir,
  renameWorkdir,
  type WorkdirEntry,
} from "../../lib/workdir";
import { useOverlay } from "../../stores/overlay";
import { insertTerminalPath, pathDragValue } from "../terminal/insert";
import { FileGlyph } from "./FileGlyph";
import { filterIndexedFiles } from "./index";
import {
  type MoveRow,
  moveTarget,
  parentDirectory,
  retargetOpen,
  retargetPath,
} from "./move";
import { fileName } from "./session";
import { buildStatusMarks, type RowMark } from "./status";

export type WorkdirChange =
  | { kind: "rename"; from: string; to: string }
  | { kind: "remove"; path: string }
  | { kind: "create" };

type RowTarget = { path: string; kind: "file" | "dir" };

type MenuState = {
  top: number;
  left: number;
  target: RowTarget | null;
};

type Draft =
  | { mode: "rename"; path: string; name: string }
  | { mode: "create-file" | "create-dir"; directory: string; name: string };

export function Explorer({
  path,
  revision,
  activePath,
  onOpen,
  onChange,
  indexed,
  indexReady,
  onRefreshIndex,
}: {
  path: string;
  revision: number;
  activePath: string | null;
  onOpen: (file: string) => void;
  onChange: (change: WorkdirChange) => void;
  indexed: string[];
  indexReady: boolean;
  onRefreshIndex: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [cache, setCache] = useState<Record<string, WorkdirEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const status = useWorkingTree(path, revision);
  const marks = useMemo(
    () => buildStatusMarks(status.entries),
    [status.entries],
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<RowTarget | null>(null);
  const [selected, setSelected] = useState<RowTarget | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [listing, setListing] = useState(0);
  const busy = useRef(false);
  const dragSource = useRef<string | null>(null);
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const folders = Object.entries(open)
    .filter(([, isOpen]) => isOpen)
    .map(([directory]) => directory)
    .sort();
  const openKey = folders.join("|");
  const needle = query.trim();

  useEffect(() => {
    let cancelled = false;
    const generation = revision;
    const pass = listing;
    const directories = openKey.split("|");
    for (const directory of directories) {
      listWorkdir(path, directory)
        .then((entries) => {
          if (!cancelled && generation === revision && pass === listing) {
            setCache((current) => ({ ...current, [directory]: entries }));
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled && generation === revision && pass === listing) {
            setError(toGitClientError(reason).message);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [path, revision, openKey, listing]);

  const results = needle ? filterIndexedFiles(indexed, needle) : null;

  function openMenu(
    event: {
      preventDefault(): void;
      stopPropagation(): void;
      clientX: number;
      clientY: number;
    },
    target: RowTarget | null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const width = 220;
    const items = target?.kind === "file" ? 6 : target ? 7 : 2;
    const height = items * 28 + 8;
    const left = Math.max(
      8,
      Math.min(event.clientX, window.innerWidth - width - 8),
    );
    const below = event.clientY;
    const top =
      below + height > window.innerHeight
        ? Math.max(8, event.clientY - height)
        : below;
    setMenu({ top, left, target });
  }

  function beginCreate(directory: string, mode: "create-file" | "create-dir") {
    setQuery("");
    setOpen((current) => revealDirectory(current, directory));
    setDraft({ mode, directory, name: "" });
    setMenu(null);
  }

  function createHere(mode: "create-file" | "create-dir") {
    const directory = selected
      ? selected.kind === "dir"
        ? selected.path
        : parentDirectory(selected.path)
      : "";
    beginCreate(directory, mode);
  }

  function collapseAll() {
    const directory = draft && draft.mode !== "rename" ? draft.directory : "";
    setOpen(revealDirectory({ "": true }, directory));
  }

  function considerDrop(event: DragEvent, row: MoveRow | null) {
    const source = dragSource.current;
    if (!source) {
      return;
    }
    event.stopPropagation();
    const directory = moveTarget(source, row);
    if (directory === null) {
      event.dataTransfer.dropEffect = "none";
      setHover(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setHover(row ? row.path : "");
  }

  async function moveTo(row: MoveRow | null) {
    const source = dragSource.current;
    setHover(null);
    if (!source) {
      return;
    }
    const directory = moveTarget(source, row);
    if (directory === null) {
      return;
    }
    try {
      const next = await moveWorkdir(path, source, directory);
      setOpen((current) =>
        revealDirectory(retargetOpen(current, source, next), directory),
      );
      setSelected((current) =>
        current
          ? {
              ...current,
              path: retargetPath(current.path, source, next),
            }
          : current,
      );
      onChange({ kind: "rename", from: source, to: next });
      setError(null);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    }
  }

  function beginRename(target: RowTarget) {
    setDraft({
      mode: "rename",
      path: target.path,
      name: fileName(target.path),
    });
    setMenu(null);
  }

  function cancelDraft() {
    draftRef.current = null;
    setDraft(null);
  }

  async function commitDraft() {
    const current = draftRef.current;
    if (busy.current || !current) {
      return;
    }
    const name = current.name.trim();
    if (!name) {
      cancelDraft();
      return;
    }
    busy.current = true;
    draftRef.current = null;
    try {
      if (current.mode === "rename") {
        const next = await renameWorkdir(path, current.path, name);
        onChange({ kind: "rename", from: current.path, to: next });
      } else if (current.mode === "create-file") {
        await createWorkdirFile(path, current.directory, name);
        onChange({ kind: "create" });
      } else {
        await createWorkdirDir(path, current.directory, name);
        onChange({ kind: "create" });
      }
      setDraft(null);
      setError(null);
    } catch (reason: unknown) {
      draftRef.current = current;
      setDraft(current);
      setError(toGitClientError(reason).message);
      setFocusTick((tick) => tick + 1);
    } finally {
      busy.current = false;
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      await removeWorkdir(path, pendingDelete.path);
      onChange({ kind: "remove", path: pendingDelete.path });
      setPendingDelete(null);
      setError(null);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    }
  }

  async function copyPath(relative: string) {
    await navigator.clipboard.writeText(relative);
    setMenu(null);
  }

  async function reveal(relative: string) {
    const root = path.endsWith("/") ? path.slice(0, -1) : path;
    await revealItemInDir(`${root}/${relative}`);
    setMenu(null);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <div className="flex items-center gap-0.5">
          <p className="min-w-0 flex-1 text-xs text-muted">Explorador</p>
          <ExplorerIcon
            label="Nuevo archivo"
            onClick={() => createHere("create-file")}
          >
            <FilePlus size={14} />
          </ExplorerIcon>
          <ExplorerIcon
            label="Nueva carpeta"
            onClick={() => createHere("create-dir")}
          >
            <FolderPlus size={14} />
          </ExplorerIcon>
          <ExplorerIcon
            label="Actualizar"
            onClick={() => {
              setListing((current) => current + 1);
              onRefreshIndex();
              status.reload();
            }}
          >
            <RefreshCw size={14} />
          </ExplorerIcon>
          <ExplorerIcon label="Contraer carpetas" onClick={collapseAll}>
            <ChevronsDownUp size={14} />
          </ExplorerIcon>
        </div>
        <input
          value={query}
          placeholder="Buscar archivos"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
            }
          }}
          className="mt-1 w-full bg-transparent text-xs outline-none placeholder:text-muted"
        />
      </header>
      {pendingDelete ? (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-[11px]">
          <span className="min-w-0 flex-1 truncate">
            ¿Eliminar {fileName(pendingDelete.path)}
            {pendingDelete.kind === "dir" ? " y su contenido" : ""}? Se borra
            del disco.
          </span>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            className="text-warn"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className="text-muted"
          >
            Cancelar
          </button>
        </div>
      ) : null}
      <div
        role="tree"
        aria-label="Explorador"
        className={`min-h-0 flex-1 overflow-auto py-1 ${
          hover === "" ? "bg-accent-dim/40" : ""
        }`}
        onContextMenu={(event) => openMenu(event, null)}
        onDragOver={(event) => considerDrop(event, null)}
        onDrop={(event) => {
          event.preventDefault();
          void moveTo(null);
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) {
            return;
          }
          setHover(null);
        }}
      >
        {error ? (
          <p className="px-3 py-1 text-[11px] text-warn">{error}</p>
        ) : null}
        {needle ? (
          <SearchResults
            results={indexReady ? results : null}
            error={null}
            activePath={activePath}
            marks={marks}
            onOpen={onOpen}
            onMenu={openMenu}
          />
        ) : (
          <TreeLevel
            directory=""
            depth={0}
            cache={cache}
            open={open}
            activePath={activePath}
            draft={draft}
            focusTick={focusTick}
            onToggle={(directory) =>
              setOpen((current) => ({
                ...current,
                [directory]: !current[directory],
              }))
            }
            onOpen={onOpen}
            onMenu={openMenu}
            onDraftName={(name) =>
              setDraft((current) => (current ? { ...current, name } : current))
            }
            onCommitDraft={() => void commitDraft()}
            onCancelDraft={cancelDraft}
            selected={selected}
            hover={hover}
            onSelect={setSelected}
            onDragStartPath={(relative) => {
              dragSource.current = relative;
            }}
            onDragEndPath={() => {
              dragSource.current = null;
              setHover(null);
            }}
            onDragOverRow={considerDrop}
            onDropRow={(event, row) => {
              event.preventDefault();
              event.stopPropagation();
              void moveTo(row);
            }}
            marks={marks}
          />
        )}
      </div>
      {menu ? (
        <FileMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onOpen={(file) => {
            setMenu(null);
            onOpen(file);
          }}
          onReveal={(relative) => void reveal(relative)}
          onCopy={(relative) => void copyPath(relative)}
          onTerminal={(relative) => {
            insertTerminalPath(relative);
            setMenu(null);
          }}
          onRename={beginRename}
          onDelete={(target) => {
            setPendingDelete(target);
            setMenu(null);
          }}
          onCreate={beginCreate}
        />
      ) : null}
    </aside>
  );
}

function SearchResults({
  results,
  error,
  activePath,
  marks,
  onOpen,
  onMenu,
}: {
  results: string[] | null;
  error: string | null;
  activePath: string | null;
  marks: Map<string, RowMark>;
  onOpen: (file: string) => void;
  onMenu: (event: MouseEvent, target: RowTarget) => void;
}) {
  if (error) {
    return <p className="px-3 py-1 text-[11px] text-warn">{error}</p>;
  }
  if (!results) {
    return <p className="px-3 py-1 text-[11px] text-muted">Buscando…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="px-3 py-1 text-[11px] text-muted">Sin coincidencias</p>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {results.map((file) => (
        <li key={file}>
          <button
            type="button"
            title={file}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", pathDragValue(file));
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onOpen(file)}
            onContextMenu={(event) =>
              onMenu(event, { path: file, kind: "file" })
            }
            className={`flex w-full min-w-0 items-center gap-1.5 px-3 py-1 text-left font-mono text-[11px] hover:bg-surface-overlay ${
              file === activePath
                ? "bg-surface-overlay text-text"
                : "text-muted"
            }`}
          >
            <FileGlyph path={file} kind="file" />
            <span className="min-w-0 flex-1 truncate">{file}</span>
            <StatusMark mark={marks.get(file)} />
          </button>
        </li>
      ))}
      {results.length === 80 ? (
        <li className="px-3 py-1 text-[11px] text-muted">
          Mostrando las primeras 80 coincidencias.
        </li>
      ) : null}
    </ul>
  );
}

function TreeLevel({
  directory,
  depth,
  cache,
  open,
  activePath,
  draft,
  focusTick,
  onToggle,
  onOpen,
  onMenu,
  onDraftName,
  onCommitDraft,
  onCancelDraft,
  selected,
  hover,
  onSelect,
  onDragStartPath,
  onDragEndPath,
  onDragOverRow,
  onDropRow,
  marks,
}: {
  directory: string;
  depth: number;
  cache: Record<string, WorkdirEntry[]>;
  open: Record<string, boolean>;
  activePath: string | null;
  draft: Draft | null;
  focusTick: number;
  onToggle: (directory: string) => void;
  onOpen: (file: string) => void;
  onMenu: (event: MouseEvent, target: RowTarget) => void;
  onDraftName: (name: string) => void;
  onCommitDraft: () => void;
  onCancelDraft: () => void;
  selected: RowTarget | null;
  hover: string | null;
  onSelect: (entry: RowTarget) => void;
  onDragStartPath: (path: string) => void;
  onDragEndPath: () => void;
  onDragOverRow: (event: DragEvent, row: RowTarget) => void;
  onDropRow: (event: DragEvent, row: RowTarget) => void;
  marks: Map<string, RowMark>;
}) {
  const entries = cache[directory];
  const creating =
    draft !== null && draft.mode !== "rename" && draft.directory === directory;
  return (
    <ul className="m-0 list-none p-0">
      {creating ? (
        <li>
          <NameRow
            key={focusTick}
            depth={depth}
            value={draft.name}
            onChange={onDraftName}
            onCommit={onCommitDraft}
            onCancel={onCancelDraft}
          />
        </li>
      ) : null}
      {!entries ? (
        <li className="px-3 py-1 text-[11px] text-muted">Leyendo…</li>
      ) : entries.length === 0 && !creating ? (
        <li className="px-3 py-1 text-[11px] text-muted">Carpeta vacía</li>
      ) : (
        entries.map((entry) => {
          const expanded = open[entry.path] === true;
          const renaming =
            draft?.mode === "rename" && draft.path === entry.path;
          return (
            <li key={entry.path}>
              {renaming ? (
                <NameRow
                  key={focusTick}
                  depth={depth}
                  value={draft.name}
                  onChange={onDraftName}
                  onCommit={onCommitDraft}
                  onCancel={onCancelDraft}
                />
              ) : (
                <button
                  type="button"
                  title={entry.path}
                  draggable
                  onDragStart={(event) => {
                    onDragStartPath(entry.path);
                    event.dataTransfer.setData(
                      "text/plain",
                      pathDragValue(entry.path),
                    );
                    event.dataTransfer.effectAllowed = "copyMove";
                  }}
                  onDragEnd={onDragEndPath}
                  onDragOver={(event) => onDragOverRow(event, entry)}
                  onDrop={(event) => onDropRow(event, entry)}
                  onClick={() => {
                    onSelect(entry);
                    if (entry.kind === "dir") {
                      onToggle(entry.path);
                    } else {
                      onOpen(entry.path);
                    }
                  }}
                  onContextMenu={(event) => {
                    onSelect(entry);
                    onMenu(event, entry);
                  }}
                  className={`flex h-7 w-full min-w-0 items-center gap-1 overflow-hidden text-left text-xs hover:bg-surface-overlay ${
                    hover === entry.path
                      ? "bg-accent-dim text-text"
                      : entry.path === activePath ||
                          selected?.path === entry.path
                        ? "bg-surface-overlay text-text"
                        : "text-muted"
                  }`}
                  style={{ paddingLeft: 8 + depth * 12 }}
                >
                  {entry.kind === "dir" ? (
                    expanded ? (
                      <ChevronDown size={12} className="shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="shrink-0" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <FileGlyph
                    path={entry.path}
                    kind={entry.kind}
                    open={expanded}
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <StatusMark mark={marks.get(entry.path)} />
                </button>
              )}
              {entry.kind === "dir" && expanded ? (
                <TreeLevel
                  directory={entry.path}
                  depth={depth + 1}
                  cache={cache}
                  open={open}
                  activePath={activePath}
                  draft={draft}
                  focusTick={focusTick}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  onDraftName={onDraftName}
                  onCommitDraft={onCommitDraft}
                  onCancelDraft={onCancelDraft}
                  selected={selected}
                  hover={hover}
                  onSelect={onSelect}
                  onDragStartPath={onDragStartPath}
                  onDragEndPath={onDragEndPath}
                  onDragOverRow={onDragOverRow}
                  onDropRow={onDropRow}
                  marks={marks}
                />
              ) : null}
            </li>
          );
        })
      )}
    </ul>
  );
}

function NameRow({
  depth,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  depth: number;
  value: string;
  onChange: (name: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <div
      className="flex h-7 items-center pr-2"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <input
        ref={field}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-label="Nombre"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCommit}
        className="min-w-0 flex-1 bg-transparent text-xs text-text outline-none"
      />
    </div>
  );
}

function FileMenu({
  menu,
  onClose,
  onOpen,
  onReveal,
  onCopy,
  onTerminal,
  onRename,
  onDelete,
  onCreate,
}: {
  menu: MenuState;
  onClose: () => void;
  onOpen: (file: string) => void;
  onReveal: (path: string) => void;
  onCopy: (path: string) => void;
  onTerminal: (path: string) => void;
  onRename: (target: RowTarget) => void;
  onDelete: (target: RowTarget) => void;
  onCreate: (directory: string, mode: "create-file" | "create-dir") => void;
}) {
  const target = menu.target;
  const directory = target
    ? target.kind === "dir"
      ? target.path
      : parentDirectory(target.path)
    : "";

  useEffect(() => {
    useOverlay.getState().push();
    return () => useOverlay.getState().pop();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Cerrar menú"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        className="fixed z-50 w-56 rounded border border-line bg-surface-raised py-1 text-left shadow-lg"
        style={{ top: menu.top, left: menu.left }}
      >
        {target?.kind === "file" ? (
          <MenuButton onClick={() => onOpen(target.path)}>Abrir</MenuButton>
        ) : null}
        {target ? (
          <>
            <MenuButton onClick={() => onReveal(target.path)}>
              Mostrar en Finder
            </MenuButton>
            <MenuButton onClick={() => onCopy(target.path)}>
              Copiar ruta relativa
            </MenuButton>
            <MenuButton onClick={() => onTerminal(target.path)}>
              Pegar ruta en la terminal
            </MenuButton>
            <MenuButton onClick={() => onRename(target)}>Renombrar</MenuButton>
            <MenuButton onClick={() => onDelete(target)}>Eliminar</MenuButton>
          </>
        ) : null}
        {target?.kind !== "file" ? (
          <>
            <MenuButton onClick={() => onCreate(directory, "create-file")}>
              Nuevo archivo
            </MenuButton>
            <MenuButton onClick={() => onCreate(directory, "create-dir")}>
              Nueva carpeta
            </MenuButton>
          </>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
    >
      {children}
    </button>
  );
}

function StatusMark({ mark }: { mark: RowMark | undefined }) {
  if (!mark) {
    return null;
  }
  if (mark.label === "·") {
    return (
      <span
        className={`mr-2 size-1.5 shrink-0 rounded-full ${
          mark.tone === "new" ? "bg-accent" : "bg-warn"
        }`}
      />
    );
  }
  return (
    <span
      className={`mr-2 shrink-0 font-mono text-[10px] ${
        mark.tone === "new" ? "text-accent" : "text-warn"
      }`}
    >
      {mark.label}
    </span>
  );
}

function revealDirectory(
  open: Record<string, boolean>,
  directory: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...open, "": true };
  if (!directory) {
    return next;
  }
  let current = "";
  for (const part of directory.split("/")) {
    current = current ? `${current}/${part}` : part;
    next[current] = true;
  }
  return next;
}

function ExplorerIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded p-0.5 text-muted hover:bg-surface-overlay hover:text-text"
    >
      {children}
    </button>
  );
}
