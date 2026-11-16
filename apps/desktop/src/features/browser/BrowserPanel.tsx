import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowRight, Plus, RotateCw, X } from "lucide-react";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { DockGlyph } from "../../components/DockGlyph";
import { useOverlay } from "../../stores/overlay";
import { browserTabLabel } from "./label";
import {
  BROWSER_PAGE_LIMIT,
  closeBrowserPage,
  openBrowserPage,
  readBrowserPages,
  rememberBrowserTitle,
  rememberBrowserUrl,
  selectBrowserPage,
  subscribeBrowserPages,
} from "./pages";
import {
  type BrowserSplit,
  includePane,
  mosaicGrid,
  pageForPane,
} from "./split";
import { normalizeUrl } from "./url";

export { clearBrowserPage, markBrowserClosed } from "./pages";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserNavigation {
  id: string;
  url: string;
}

interface BrowserTitle {
  id: string;
  title: string;
}

interface PageMenu {
  id: string;
  top: number;
  left: number;
}

function readBounds(node: HTMLElement | null): Bounds | null {
  if (!node) {
    return null;
  }
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return null;
  }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function message(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }
  if (reason instanceof Error) {
    return reason.message;
  }
  return "No se pudo abrir la página";
}

export function useBrowserLabel(): string {
  return useSyncExternalStore(
    subscribeBrowserPages,
    browserLabelSnapshot,
    browserLabelSnapshot,
  );
}

function browserLabelSnapshot(): string {
  const state = readBrowserPages();
  const page =
    state.pages.find((item) => item.id === state.activeId) ?? state.pages[0];
  return browserTabLabel(page?.url ?? null, page?.title ?? null);
}

export function BrowserPanel({ active }: { active: boolean }) {
  const occluded = useOverlay((state) => state.depth > 0);
  const pages = useSyncExternalStore(
    subscribeBrowserPages,
    readBrowserPages,
    readBrowserPages,
  );
  const [flow, setFlow] = useState<BrowserSplit>("side");
  const [panes, setPanes] = useState<string[]>([]);
  const [menu, setMenu] = useState<PageMenu | null>(null);
  const shown = active && !occluded;
  const primary =
    pages.pages.find((page) => page.id === pages.activeId) ?? pages.pages[0];
  const primaryId = primary?.id ?? "1";
  const mosaic = panes.filter((id) =>
    pages.pages.some((page) => page.id === id),
  );
  const visible = mosaic.length > 1 ? mosaic : [primaryId];
  const grid = mosaicGrid(visible.length, flow);

  useEffect(() => {
    let stop = false;
    const stops: Array<() => void> = [];
    void listen<BrowserNavigation>("browser-navigated", (event) => {
      rememberBrowserUrl(event.payload.id, event.payload.url);
    })
      .then((unlisten) => {
        if (stop) {
          unlisten();
          return;
        }
        stops.push(unlisten);
      })
      .catch(() => undefined);
    void listen<BrowserTitle>("browser-title", (event) => {
      rememberBrowserTitle(event.payload.id, event.payload.title);
    })
      .then((unlisten) => {
        if (stop) {
          unlisten();
          return;
        }
        stops.push(unlisten);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
      for (const stopListener of stops) {
        stopListener();
      }
    };
  }, []);

  useLayoutEffect(() => {
    return () => {
      for (const page of readBrowserPages().pages) {
        if (page.url) {
          void invoke("browser_set_visible", { id: page.id, visible: false });
        }
      }
    };
  }, []);

  function focusPage(id: string) {
    selectBrowserPage(id);
    if (visible.length > 1 && !visible.includes(id)) {
      setPanes(includePane(visible, id));
    }
  }

  function divide(direction: BrowserSplit, pageId: string) {
    const base = visible.length > 1 ? visible : [primaryId];
    const extra = pageForPane(base, pages.pages, pageId);
    const next = extra ?? openBrowserPage(false);
    if (!next) {
      return;
    }
    setFlow(direction);
    setPanes(includePane(base, next));
    setMenu(null);
  }

  function showAll() {
    const ids = pages.pages.map((page) => page.id);
    if (ids.length < 2) {
      return;
    }
    setPanes(ids);
    setMenu(null);
  }

  function hidePane(id: string) {
    const next = visible.filter((item) => item !== id);
    setPanes(next);
    if (id === primaryId && next[0]) {
      selectBrowserPage(next[0]);
    }
    setMenu(null);
  }

  function remove(id: string) {
    closeBrowserPage(id);
    setPanes((current) => current.filter((item) => item !== id));
    void invoke("browser_close", { id });
  }

  function openMenu(id: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const width = 196;
    const splitOpen = visible.length > 1;
    const count =
      2 + (pages.pages.length > visible.length ? 1 : 0) + (splitOpen ? 2 : 0);
    const height = count * 28 + 8;
    const left = Math.max(
      8,
      Math.min(event.clientX, window.innerWidth - width - 8),
    );
    const top =
      event.clientY + height > window.innerHeight
        ? Math.max(8, event.clientY - height)
        : event.clientY;
    setMenu({ id, top, left });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1">
        {pages.pages.map((page) => {
          const selected = page.id === primaryId;
          const parked = visible.length > 1 && visible.includes(page.id);
          const label = browserTabLabel(page.url, page.title);
          return (
            <div
              key={page.id}
              className={`flex max-w-52 shrink-0 items-center rounded ${
                selected
                  ? "bg-surface-overlay text-text"
                  : parked
                    ? "text-text ring-1 ring-line"
                    : "text-muted"
              }`}
            >
              <button
                type="button"
                title={page.url ?? label}
                onClick={() => focusPage(page.id)}
                onMouseDown={(event) => {
                  if (event.button === 2) {
                    event.preventDefault();
                  }
                }}
                onContextMenu={(event) => openMenu(page.id, event)}
                className="min-w-0 select-none truncate px-2 py-0.5 text-left text-[11px]"
              >
                {label}
              </button>
              <button
                type="button"
                aria-label={`Cerrar ${label}`}
                onClick={() => remove(page.id)}
                className="mr-1 rounded p-0.5 hover:bg-surface hover:text-text"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Nueva página"
          title="Nueva página"
          disabled={pages.pages.length >= BROWSER_PAGE_LIMIT}
          onClick={() => {
            const id = openBrowserPage(visible.length <= 1);
            if (id && visible.length > 1) {
              setPanes(includePane(visible, id));
            }
          }}
          className="rounded p-1 text-muted hover:bg-surface-overlay hover:text-text disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>
      {visible.length > 1 ? (
        <div
          className="grid min-h-0 flex-1 gap-px bg-line"
          style={{
            gridTemplateColumns: grid.columns,
            gridTemplateRows: grid.rows,
          }}
        >
          {visible.map((id) => (
            <BrowserSurface key={id} id={id} shown={shown} />
          ))}
        </div>
      ) : (
        <BrowserSurface id={primaryId} shown={shown} />
      )}
      {menu ? (
        <PageMenu
          split={visible.length > 1}
          canShowAll={pages.pages.length > visible.length}
          canRemove={visible.length > 1 && visible.includes(menu.id)}
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onSplit={(direction) => divide(direction, menu.id)}
          onShowAll={showAll}
          onRemove={() => hidePane(menu.id)}
          onJoin={() => {
            setPanes([]);
            setMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}

function BrowserSurface({ id, shown }: { id: string; shown: boolean }) {
  const holeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedValue = useRef<string | null>(null);
  const pages = useSyncExternalStore(
    subscribeBrowserPages,
    readBrowserPages,
    readBrowserPages,
  );
  const page = pages.pages.find((item) => item.id === id);
  const url = page?.url ?? "";
  const [draft, setDraft] = useState(url);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      return;
    }
    setDraft(url);
  }, [url]);

  usePageFrame(id, shown, holeRef);

  async function go(event: FormEvent) {
    event.preventDefault();
    const next = normalizeUrl(draft);
    if (!next) {
      setError("Escribe una dirección http o https.");
      return;
    }
    const bounds = readBounds(holeRef.current);
    if (!bounds) {
      setError("El visor todavía no tiene tamaño.");
      return;
    }
    setError(null);
    try {
      await invoke("browser_navigate", { id, url: next, ...bounds });
      rememberBrowserUrl(id, next);
      setDraft(next);
    } catch (reason) {
      setError(message(reason));
    }
  }

  async function run(command: string) {
    try {
      await invoke(command, { id });
      setError(null);
    } catch (reason) {
      setError(message(reason));
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <form
        className="flex items-center gap-1 border-b border-line px-2 py-1"
        onSubmit={(event) => {
          void go(event);
        }}
      >
        <BarButton
          label="Atrás"
          disabled={!url}
          onClick={() => {
            void run("browser_back");
          }}
        >
          <ArrowLeft size={14} />
        </BarButton>
        <BarButton
          label="Adelante"
          disabled={!url}
          onClick={() => {
            void run("browser_forward");
          }}
        >
          <ArrowRight size={14} />
        </BarButton>
        <BarButton
          label="Recargar"
          disabled={!url}
          onClick={() => {
            void run("browser_reload");
          }}
        >
          <RotateCw size={14} />
        </BarButton>
        <input
          ref={inputRef}
          value={draft}
          aria-label="Dirección"
          placeholder="https://ejemplo.com"
          spellCheck={false}
          onFocus={(event) => {
            focusedValue.current = event.target.value;
          }}
          onBlur={(event) => {
            if (url && event.target.value === focusedValue.current) {
              setDraft(url);
            }
            focusedValue.current = null;
          }}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs"
        />
      </form>
      {error ? <p className="px-2 py-1 text-xs text-warn">{error}</p> : null}
      <div ref={holeRef} className="min-h-0 flex-1 bg-surface">
        {url ? null : (
          <p className="p-3 text-xs text-muted">Escribe una URL arriba.</p>
        )}
      </div>
    </div>
  );
}

function usePageFrame(
  id: string,
  shown: boolean,
  holeRef: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const pageId = id;
    let alive = true;
    let frame = 0;
    let restoring = false;

    function hide() {
      void invoke("browser_set_visible", { id: pageId, visible: false });
    }

    function move(bounds: Bounds, reveal: boolean) {
      const page = readBrowserPages().pages.find((item) => item.id === pageId);
      if (!page?.url) {
        return;
      }
      if (!page.live) {
        if (restoring) {
          return;
        }
        restoring = true;
        void invoke("browser_navigate", {
          id: pageId,
          url: page.url,
          ...bounds,
        })
          .then(() => {
            restoring = false;
            if (alive) {
              rememberBrowserUrl(pageId, page.url ?? "");
            }
          })
          .catch(() => {
            restoring = false;
          });
        return;
      }
      void invoke("browser_set_bounds", { id: pageId, ...bounds }).then(() => {
        if (!alive || !reveal) {
          return;
        }
        void invoke("browser_set_visible", { id: pageId, visible: true });
      });
    }

    if (!shown) {
      hide();
      return;
    }
    const node = holeRef.current;
    const bounds = readBounds(node);
    if (bounds) {
      move(bounds, true);
    }
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readBounds(holeRef.current);
        if (next) {
          move(next, false);
        }
      });
    });
    observer.observe(node);
    function onResize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readBounds(holeRef.current);
        if (next) {
          move(next, false);
        }
      });
    }
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      hide();
    };
  }, [holeRef, id, shown]);
}

function PageMenu({
  split,
  canShowAll,
  canRemove,
  top,
  left,
  onClose,
  onSplit,
  onShowAll,
  onRemove,
  onJoin,
}: {
  split: boolean;
  canShowAll: boolean;
  canRemove: boolean;
  top: number;
  left: number;
  onClose: () => void;
  onSplit: (direction: BrowserSplit) => void;
  onShowAll: () => void;
  onRemove: () => void;
  onJoin: () => void;
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
          onClick={() => onSplit("side")}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
        >
          <DockGlyph place="right" />
          <span className="flex-1">Dividir al lado</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => onSplit("stack")}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
        >
          <DockGlyph place="bottom" />
          <span className="flex-1">Dividir abajo</span>
        </button>
        {canShowAll ? (
          <button
            type="button"
            role="menuitem"
            onClick={onShowAll}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
          >
            Mostrar todas
          </button>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            role="menuitem"
            onClick={onRemove}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
          >
            Quitar esta vista
          </button>
        ) : null}
        {split ? (
          <button
            type="button"
            role="menuitem"
            onClick={onJoin}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
          >
            Quitar división
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

function BarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
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
