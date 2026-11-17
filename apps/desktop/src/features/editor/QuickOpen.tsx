import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../stores/overlay";
import { FileGlyph } from "./FileGlyph";
import { filterIndexedFiles } from "./index";
import { parentDirectory } from "./move";
import { fileName, readSession } from "./session";

export function QuickOpen({
  path,
  focusTick,
  indexed,
  ready,
  truncated,
  indexError,
  onOpen,
  onClose,
}: {
  path: string;
  focusTick: number;
  indexed: string[];
  ready: boolean;
  truncated: boolean;
  indexError: string | null;
  onOpen: (file: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [trackedKey, setTrackedKey] = useState("open");
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const needle = query.trim();

  useEffect(() => {
    useOverlay.getState().push();
    return () => useOverlay.getState().pop();
  }, []);

  useEffect(() => {
    if (focusTick < 0) {
      return;
    }
    field.current?.focus();
    field.current?.select();
  }, [focusTick]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = useMemo(
    () => filterIndexedFiles(indexed, needle),
    [indexed, needle],
  );
  const opened = useMemo(() => openWorkFiles(path), [path]);
  const files = needle ? matches : opened;
  const waiting = Boolean(needle) && !ready && !indexError;

  const resultKey = needle ? matches.join("\n") : "open";
  if (trackedKey !== resultKey) {
    setTrackedKey(resultKey);
    setActive(0);
  }

  useEffect(() => {
    if (active < 0 || files.length === 0) {
      return;
    }
    const item = list.current?.querySelector<HTMLElement>(
      "[aria-selected='true']",
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [active, files]);

  function choose(file: string | undefined) {
    if (!file) {
      return;
    }
    onOpen(file);
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar búsqueda"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Buscar archivos"
        className="absolute top-16 left-1/2 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded border border-line bg-surface-raised shadow-lg"
      >
        <input
          ref={field}
          value={query}
          placeholder="Buscar archivos"
          spellCheck={false}
          autoComplete="off"
          aria-label="Buscar archivos"
          aria-controls="quick-open-results"
          aria-activedescendant={
            files[active] ? `quick-open-${active}` : undefined
          }
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) =>
                files.length === 0 ? 0 : (current + 1) % files.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) =>
                files.length === 0
                  ? 0
                  : (current - 1 + files.length) % files.length,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(files[active]);
            }
          }}
          className="w-full border-b border-line bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted"
        />
        <div
          ref={list}
          id="quick-open-results"
          role="listbox"
          className="max-h-80 overflow-auto py-1"
        >
          {indexError ? (
            <p className="px-3 py-2 text-xs text-warn">{indexError}</p>
          ) : waiting ? (
            <p className="px-3 py-2 text-xs text-muted">Buscando…</p>
          ) : files.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">
              {needle ? "Sin coincidencias" : "Escribe para buscar archivos"}
            </p>
          ) : (
            <>
              {!needle ? (
                <p className="px-3 py-1 text-[11px] text-muted">Abiertos</p>
              ) : null}
              {files.map((file, index) => {
                const directory = parentDirectory(file);
                const current = index === active;
                return (
                  <button
                    key={file}
                    id={`quick-open-${index}`}
                    type="button"
                    role="option"
                    aria-selected={current}
                    title={file}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(file)}
                    className={`flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left ${
                      current ? "bg-surface-overlay" : ""
                    }`}
                  >
                    <FileGlyph path={file} kind="file" />
                    <span className="shrink-0 text-xs text-text">
                      {fileName(file)}
                    </span>
                    {directory ? (
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                        {directory}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {needle && (files.length === 80 || truncated) ? (
                <p className="px-3 py-1 text-[11px] text-muted">
                  {truncated
                    ? "El índice del proyecto está truncado."
                    : "Mostrando las primeras 80 coincidencias."}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function openWorkFiles(path: string): string[] {
  const session = readSession(path);
  const files = session.tabs
    .filter((tab) => tab.sha === null)
    .map((tab) => tab.path);
  const active = session.tabs.find((tab) => tab.id === session.active);
  if (!active || active.sha !== null) {
    return files;
  }
  return [active.path, ...files.filter((file) => file !== active.path)];
}
