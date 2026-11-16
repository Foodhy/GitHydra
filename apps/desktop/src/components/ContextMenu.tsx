import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../stores/overlay";

export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
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

  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Cerrar menú"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed z-50 min-w-52 rounded border border-line bg-surface-raised py-1 text-left shadow-lg"
        style={{ left, top }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`block w-full px-3 py-1.5 text-left text-xs disabled:text-muted ${
              item.danger ? "text-warn" : "text-text"
            } hover:bg-surface-overlay disabled:hover:bg-transparent`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
