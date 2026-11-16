import { type LucideIcon, X } from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DockGlyph } from "../../components/DockGlyph";
import { useOverlay } from "../../stores/overlay";
import {
  type Box,
  type DropZone,
  EDGE_ZONES,
  type PanelId,
  zoneAt,
  zoneLabel,
  zoneRect,
} from "./layout-tree";

let swallowClick = false;

export function PaneTabs({
  paneId,
  tabs,
  active,
  labelFor,
  iconFor,
  closable,
  onActivate,
  onClose,
  onPlace,
}: {
  paneId: string;
  tabs: PanelId[];
  active: PanelId;
  labelFor: (panel: PanelId) => string;
  iconFor: Record<PanelId, LucideIcon>;
  closable: (panel: PanelId) => boolean;
  onActivate: (panel: PanelId) => void;
  onClose: (panel: PanelId) => void;
  onPlace: (panel: PanelId, targetId: string, zone: DropZone) => void;
}) {
  const [menu, setMenu] = useState<{
    panel: PanelId;
    top: number;
    left: number;
  } | null>(null);
  const [drag, setDrag] = useState<Box | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDrag.current?.(), []);

  function beginDrag(
    panel: PanelId,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) {
      return;
    }
    stopDrag.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stopDrag.current = null;
    };
    const move = (pointer: PointerEvent) => {
      if (!dragging) {
        const distance = Math.hypot(
          pointer.clientX - startX,
          pointer.clientY - startY,
        );
        if (distance < 5) {
          return;
        }
        dragging = true;
      }
      const hit = paneAt(pointer.clientX, pointer.clientY);
      setDrag(
        hit
          ? zoneRect(
              hit.rect,
              zoneAt(hit.rect, pointer.clientX, pointer.clientY),
            )
          : null,
      );
    };
    const up = (pointer: PointerEvent) => {
      stop();
      setDrag(null);
      if (!dragging) {
        return;
      }
      swallowClick = true;
      window.setTimeout(() => {
        swallowClick = false;
      }, 0);
      const hit = paneAt(pointer.clientX, pointer.clientY);
      if (!hit) {
        return;
      }
      onPlace(
        panel,
        hit.id,
        zoneAt(hit.rect, pointer.clientX, pointer.clientY),
      );
    };
    stopDrag.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <>
      <div
        className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2"
        role="tablist"
      >
        {tabs.map((panel) => {
          const Icon = iconFor[panel];
          const label = labelFor(panel);
          const selected = panel === active;
          return (
            <div
              key={panel}
              className={`flex items-center rounded ${selected ? "bg-surface-overlay text-text" : "text-muted"}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                title={label}
                onClick={() => {
                  if (swallowClick) {
                    swallowClick = false;
                    return;
                  }
                  onActivate(panel);
                }}
                onPointerDown={(event) => beginDrag(panel, event)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenu({ panel, ...menuAt(event.clientX, event.clientY) });
                }}
                className="flex items-center gap-1.5 rounded py-1 pr-1 pl-2 text-xs"
              >
                <Icon size={13} className="shrink-0" />
                <span className="max-w-40 truncate">{label}</span>
              </button>
              {closable(panel) ? (
                <button
                  type="button"
                  aria-label={`Cerrar ${label}`}
                  title={`Cerrar ${label}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onClose(panel)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ panel, ...menuAt(event.clientX, event.clientY) });
                  }}
                  className="mr-1 rounded p-0.5 hover:bg-surface hover:text-text"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {drag ? <DropOverlay rect={drag} /> : null}
      {menu ? (
        <PlaceMenu
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onPlace={(zone) => {
            const panel = menu.panel;
            setMenu(null);
            onPlace(panel, paneId, zone);
          }}
        />
      ) : null}
    </>
  );
}

function menuAt(x: number, y: number): { top: number; left: number } {
  const width = 176;
  const height = EDGE_ZONES.length * 28 + 8;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = y + height > window.innerHeight ? Math.max(8, y - height) : y;
  return { top, left };
}

function paneAt(x: number, y: number): { id: string; rect: Box } | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof Element)) {
      continue;
    }
    const host = element.closest("[data-pane-id]");
    if (!(host instanceof HTMLElement)) {
      continue;
    }
    const id = host.dataset.paneId;
    if (!id) {
      continue;
    }
    const rect = host.getBoundingClientRect();
    return {
      id,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
  }
  return null;
}

export function DropOverlay({ rect }: { rect: Box }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-30 rounded-sm border border-accent bg-accent/20"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />,
    document.body,
  );
}

function PlaceMenu({
  top,
  left,
  onClose,
  onPlace,
}: {
  top: number;
  left: number;
  onClose: () => void;
  onPlace: (zone: DropZone) => void;
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
        className="fixed z-50 w-44 rounded border border-line bg-surface-raised py-1 text-left shadow-lg"
        style={{ top, left }}
      >
        {EDGE_ZONES.map((zone) => (
          <button
            key={zone}
            type="button"
            role="menuitem"
            onClick={() => onPlace(zone)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-surface-overlay"
          >
            <DockGlyph place={zone} />
            <span className="flex-1">{zoneLabel[zone]}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

export function PaneBody({
  active,
  tabs,
  keepMounted,
  children,
}: {
  active: PanelId;
  tabs: PanelId[];
  keepMounted: (panel: PanelId) => boolean;
  children: (panel: PanelId) => ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {tabs.map((panel) =>
        panel === active || keepMounted(panel) ? (
          <div key={panel} className={panel === active ? "h-full" : "hidden"}>
            {children(panel)}
          </div>
        ) : null,
      )}
    </div>
  );
}
