import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Eraser, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "@xterm/xterm/css/xterm.css";
import { type ProjectScripts, visiblePins } from "@githydra/contracts";
import { loadProjectScripts } from "../../lib/project-scripts";
import { useOverlay } from "../../stores/overlay";
import { SCRIPT_ICON } from "../scripts/script-icons";
import { pathFromDrop, shellToken, TERMINAL_INSERT } from "./insert";
import { withCarriageReturn } from "./newline";
import {
  applyRuns,
  pullJobs,
  pushJob,
  releaseHeld,
  TERMINAL_RUN,
  type TerminalJob,
  takeRuns,
} from "./run";
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

export function TerminalPanel({
  path,
  revision,
}: {
  path: string;
  revision: number;
}) {
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
  const [scripts, setScripts] = useState<ProjectScripts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const current = revision;
    loadProjectScripts(path)
      .then((book) => {
        if (!cancelled && current === revision) {
          setScripts(book);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScripts(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  useEffect(() => {
    function onRun() {
      const requests = takeRuns();
      if (requests.length === 0) {
        return;
      }
      let active: string | null = null;
      setTabs((current) => {
        const applied = applyRuns(current, requests, () => crypto.randomUUID());
        for (const job of applied.jobs) {
          pushJob(job.tabId, job.job);
        }
        active = applied.active;
        return applied.tabs;
      });
      if (active) {
        setActiveId(active);
      }
    }
    window.addEventListener(TERMINAL_RUN, onRun);
    onRun();
    return () => window.removeEventListener(TERMINAL_RUN, onRun);
  }, []);

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
              className={`flex max-w-48 shrink-0 items-center rounded border-b-2 ${
                selected ? "text-text" : "text-muted"
              }`}
              style={{
                background: `color-mix(in srgb, ${tab.color} ${selected ? "46%" : "24%"}, transparent)`,
                borderBottomColor: tab.color,
              }}
            >
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
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Limpiar"
            aria-label="Limpiar terminal"
            disabled={!activeId}
            onClick={() => {
              pushJob(activeId, { text: "clear\r", clear: true });
              window.dispatchEvent(new CustomEvent(TERMINAL_RUN));
            }}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-overlay hover:text-text disabled:opacity-40"
          >
            <Eraser size={12} />
          </button>
          {scripts
            ? visiblePins(scripts).map((name) => {
                const icon = scripts.icons[name];
                const Icon = icon ? SCRIPT_ICON[icon] : null;
                return (
                  <button
                    key={name}
                    type="button"
                    title={scripts.scripts[name]}
                    aria-label={name}
                    disabled={!activeId}
                    onClick={() => {
                      const command = scripts.scripts[name];
                      if (!command || !activeId) {
                        return;
                      }
                      pushJob(activeId, { text: `${command}\r`, clear: false });
                      window.dispatchEvent(new CustomEvent(TERMINAL_RUN));
                    }}
                    className="max-w-28 truncate rounded px-1.5 py-0.5 text-[11px] text-text hover:bg-surface-overlay disabled:opacity-40"
                  >
                    {Icon ? <Icon size={12} /> : name}
                  </button>
                );
              })
            : null}
        </div>
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
              tabId={tab.id}
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
  tabId,
  path,
  active,
  color,
}: {
  tabId: string;
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
    const held: TerminalJob[] = [];
    const stops: Array<() => void> = [];

    function writeInput(data: string) {
      if (session.id === 0 || data.length === 0) {
        return;
      }
      void invoke("pty_write", { id: session.id, data });
    }
    function deliver(incoming: TerminalJob[]) {
      const released = releaseHeld(session.id !== 0, [...held, ...incoming]);
      held.length = 0;
      held.push(...released.hold);
      for (const job of released.send) {
        if (job.clear) {
          term.clear();
        }
        writeInput(job.text);
      }
    }
    function flush() {
      deliver(pullJobs(tabId));
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
    window.addEventListener(TERMINAL_RUN, flush);
    flush();
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
      let precededByCr = false;
      const output = await listen<{ id: number; data: string }>(
        "pty-output",
        (event) => {
          if (event.payload.id !== session.id) {
            return;
          }
          const normalized = withCarriageReturn(
            event.payload.data,
            precededByCr,
          );
          precededByCr = normalized.precededByCr;
          term.write(normalized.text);
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
      flush();
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
      window.removeEventListener(TERMINAL_RUN, flush);
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
  }, [path, tabId]);

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
  const surface = cssColor("--color-surface", "#12141a");
  const foreground = cssColor("--color-text", "#e7e9ef");
  return {
    background: mixHex(surface, color, 0.16),
    foreground,
    cursor: color,
  };
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function mixHex(base: string, tint: string, amount: number): string {
  const left = parseHex(base);
  const right = parseHex(tint);
  if (!left || !right) {
    return base;
  }
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * amount);
  return `#${[0, 1, 2]
    .map((index) =>
      channel(left[index] ?? 0, right[index] ?? 0)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function parseHex(value: string): [number, number, number] | null {
  const normalized = value.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
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
        <div className="grid grid-cols-4 gap-1 px-3 py-1.5">
          {TERMINAL_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Color ${swatch}`}
              onClick={() => onColor(swatch)}
              className={`h-5 rounded-sm border-b-2 ${
                swatch === color ? "ring-1 ring-text" : ""
              }`}
              style={{
                background: `color-mix(in srgb, ${swatch} 46%, transparent)`,
                borderBottomColor: swatch,
              }}
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
