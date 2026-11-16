import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "@xterm/xterm/css/xterm.css";
import { useOverlay } from "../../stores/overlay";
import { pathFromDrop, shellToken, TERMINAL_INSERT } from "./insert";
import {
  addTerminal,
  closeTerminal,
  createTerminal,
  loadTerminals,
  recolorTerminal,
  renameTerminal,
  saveTerminals,
  TERMINAL_COLORS,
  TERMINAL_LIMIT,
  type TerminalTab,
} from "./sessions";

export function TerminalPanel({ path }: { path: string }) {
  const [tracked, setTracked] = useState(path);
  const [tabs, setTabs] = useState<TerminalTab[]>(() =>
    loadTerminals(localStorage, path),
  );
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipRename = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      return;
    }
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [editing]);
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);

  if (tracked !== path) {
    const next = loadTerminals(localStorage, path);
    setTracked(path);
    setTabs(next);
    setActiveId(next[0]?.id ?? "");
    setEditing(null);
  }

  useEffect(() => {
    saveTerminals(localStorage, tracked, tabs);
  }, [tracked, tabs]);

  function openTab() {
    const tab = createTerminal(crypto.randomUUID(), tabs.length);
    const next = addTerminal(tabs, tab);
    if (next.length === tabs.length) {
      return;
    }
    setTabs(next);
    setActiveId(tab.id);
  }

  function closeForever(id: string) {
    const next = closeTerminal(tabs, id);
    setTabs(next);
    if (activeId === id) {
      const index = tabs.findIndex((tab) => tab.id === id);
      setActiveId(next[index]?.id ?? next[index - 1]?.id ?? "");
    }
    setMenu(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1">
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`flex max-w-48 shrink-0 items-center rounded ${
                selected ? "bg-surface-overlay text-text" : "text-muted"
              }`}
            >
              <span
                className="ml-1.5 size-2 shrink-0 rounded-full"
                style={{ background: tab.color }}
              />
              {editing === tab.id ? (
                <input
                  value={draft}
                  aria-label="Nombre de la terminal"
                  ref={nameRef}
                  className="w-28 bg-transparent px-1.5 py-0.5 text-[11px] text-text outline-none"
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    if (skipRename.current) {
                      skipRename.current = false;
                      return;
                    }
                    setTabs(renameTerminal(tabs, tab.id, draft));
                    setEditing(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      skipRename.current = true;
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  title="Doble clic para renombrar"
                  onClick={() => setActiveId(tab.id)}
                  onDoubleClick={() => {
                    setDraft(tab.name);
                    setEditing(tab.id);
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 2) {
                      event.preventDefault();
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const width = 196;
                    const height = 28 * 2 + 36;
                    const left = Math.max(
                      8,
                      Math.min(event.clientX, window.innerWidth - width - 8),
                    );
                    const top =
                      event.clientY + height > window.innerHeight
                        ? Math.max(8, event.clientY - height)
                        : event.clientY;
                    setMenu({ id: tab.id, top, left });
                  }}
                  className="min-w-0 select-none truncate px-1.5 py-0.5 text-left text-[11px]"
                >
                  {tab.name}
                </button>
              )}
              <button
                type="button"
                aria-label={`Cerrar ${tab.name} del todo`}
                title="Cerrar del todo"
                onClick={() => closeForever(tab.id)}
                className="mr-1 rounded p-0.5 hover:bg-surface hover:text-text"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Nueva terminal"
          title="Nueva terminal"
          disabled={tabs.length >= TERMINAL_LIMIT}
          onClick={openTab}
          className="rounded p-1 text-muted hover:bg-surface-overlay hover:text-text disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 ? (
          <button
            type="button"
            onClick={openTab}
            className="m-3 rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-text"
          >
            Nueva terminal
          </button>
        ) : (
          tabs.map((tab) => (
            <TerminalSession
              key={`${tracked}:${tab.id}`}
              path={tracked}
              active={tab.id === activeId}
              color={tab.color}
            />
          ))
        )}
      </div>
      {menu ? (
        <TerminalMenu
          color={tabs.find((tab) => tab.id === menu.id)?.color ?? ""}
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onRename={() => {
            const tab = tabs.find((item) => item.id === menu.id);
            setDraft(tab?.name ?? "");
            setEditing(menu.id);
            setMenu(null);
          }}
          onColor={(color) => {
            setTabs(recolorTerminal(tabs, menu.id, color));
          }}
          onCloseForever={() => closeForever(menu.id)}
        />
      ) : null}
    </div>
  );
}

function TerminalSession({
  path,
  active,
  color,
}: {
  path: string;
  active: boolean;
  color: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const colorRef = useRef(color);
  activeRef.current = active;
  colorRef.current = color;

  useEffect(() => {
    if (!active) {
      return;
    }
    fitRef.current?.fit();
  }, [active]);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: "SF Mono, ui-monospace, monospace",
      theme: terminalTheme(colorRef.current),
    });
    const fit = new FitAddon();
    termRef.current = term;
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(element);
    const session = { id: 0, closed: false };
    const stops: Array<() => void> = [];

    function writeInput(data: string) {
      if (session.id === 0 || data.length === 0) {
        return;
      }
      void invoke("pty_write", { id: session.id, data });
    }
    term.onData((data) => {
      writeInput(data);
    });
    const onInsert = (event: Event) => {
      if (!activeRef.current) {
        return;
      }
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        writeInput(detail);
      }
    };
    window.addEventListener(TERMINAL_INSERT, onInsert);
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("text/plain")) {
        event.preventDefault();
      }
    };
    const onDrop = (event: DragEvent) => {
      const relative = pathFromDrop(
        event.dataTransfer?.getData("text/plain") ?? "",
      );
      if (!relative) {
        return;
      }
      event.preventDefault();
      writeInput(shellToken(relative));
    };
    element.addEventListener("dragover", onDragOver);
    element.addEventListener("drop", onDrop);
    term.onResize(({ cols, rows }) => {
      if (session.id === 0 || cols < 2 || rows < 2) {
        return;
      }
      void invoke("pty_resize", { id: session.id, rows, cols });
    });
    const observer = new ResizeObserver(() => {
      if (element.getBoundingClientRect().width < 2) {
        return;
      }
      fit.fit();
    });
    observer.observe(element);
    if (activeRef.current) {
      fit.fit();
    }

    void (async () => {
      const output = await listen<{ id: number; data: string }>(
        "pty-output",
        (event) => {
          if (event.payload.id === session.id) {
            term.write(event.payload.data);
          }
        },
      );
      stops.push(output);
      const exit = await listen<{ id: number }>("pty-exit", (event) => {
        if (event.payload.id === session.id) {
          term.writeln("\r\nLa sesión terminó.");
        }
      });
      stops.push(exit);
      if (session.closed) {
        return;
      }
      const id = await invoke<number>("pty_open", { path });
      if (session.closed) {
        await invoke("pty_close", { id });
        return;
      }
      session.id = id;
      if (term.cols >= 2 && term.rows >= 2) {
        void invoke("pty_resize", {
          id,
          rows: term.rows,
          cols: term.cols,
        });
      }
    })().catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      term.writeln(message);
    });

    return () => {
      session.closed = true;
      termRef.current = null;
      fitRef.current = null;
      window.removeEventListener(TERMINAL_INSERT, onInsert);
      element.removeEventListener("dragover", onDragOver);
      element.removeEventListener("drop", onDrop);
      observer.disconnect();
      for (const stop of stops) {
        stop();
      }
      if (session.id !== 0) {
        void invoke("pty_close", { id: session.id });
      }
      term.dispose();
    };
  }, [path]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }
    term.options.theme = terminalTheme(color);
  }, [color]);

  return (
    <div
      ref={host}
      className={`bg-surface px-2 py-1 ${
        active ? "absolute inset-0" : "hidden"
      }`}
    />
  );
}

function terminalTheme(color: string) {
  return {
    background: "#12141a",
    foreground: "#e7e9ef",
    cursor: color,
  };
}

function TerminalMenu({
  color,
  top,
  left,
  onClose,
  onRename,
  onColor,
  onCloseForever,
}: {
  color: string;
  top: number;
  left: number;
  onClose: () => void;
  onRename: () => void;
  onColor: (color: string) => void;
  onCloseForever: () => void;
}) {
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
        className="fixed z-50 w-48 rounded border border-line bg-surface-raised py-1 text-left shadow-lg"
        style={{ top, left }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onRename}
          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
        >
          Renombrar
        </button>
        <div className="flex flex-wrap gap-1 px-3 py-1.5">
          {TERMINAL_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Color ${swatch}`}
              onClick={() => onColor(swatch)}
              className={`size-4 rounded-full ${
                swatch === color ? "ring-2 ring-text" : ""
              }`}
              style={{ background: swatch }}
            />
          ))}
        </div>
        <button
          type="button"
          role="menuitem"
          onClick={onCloseForever}
          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
        >
          Cerrar del todo
        </button>
      </div>
    </>,
    document.body,
  );
}
