import { PanelsTopLeft, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../../stores/overlay";
import {
  deletePreset,
  type LayoutPreset,
  readPresets,
  savePreset,
} from "./layout-presets";
import { cloneLayout, type LayoutNode, nextLayoutId } from "./layout-tree";

export function LayoutMenu({
  tree,
  onApply,
}: {
  tree: LayoutNode;
  onApply: (tree: LayoutNode) => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<LayoutPreset[]>([]);

  return (
    <>
      <button
        type="button"
        title="Disposiciones"
        aria-label="Disposiciones"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const width = 260;
          const left = Math.max(
            8,
            Math.min(rect.right - width, window.innerWidth - width - 8),
          );
          setPresets(readPresets(localStorage));
          setMenu({ top: rect.bottom + 6, left });
        }}
        className="rounded-md p-1.5 text-muted hover:bg-surface-overlay hover:text-text"
      >
        <PanelsTopLeft size={16} />
      </button>
      {menu ? (
        <PresetPopover
          top={menu.top}
          left={menu.left}
          name={name}
          presets={presets}
          onName={setName}
          onClose={() => setMenu(null)}
          onSave={() => {
            setPresets(savePreset(localStorage, name, tree, nextLayoutId()));
            setName("");
          }}
          onApply={(preset) => {
            onApply(cloneLayout(preset.tree));
            setMenu(null);
          }}
          onDelete={(id) => setPresets(deletePreset(localStorage, id))}
        />
      ) : null}
    </>
  );
}

function PresetPopover({
  top,
  left,
  name,
  presets,
  onName,
  onClose,
  onSave,
  onApply,
  onDelete,
}: {
  top: number;
  left: number;
  name: string;
  presets: LayoutPreset[];
  onName: (name: string) => void;
  onClose: () => void;
  onSave: () => void;
  onApply: (preset: LayoutPreset) => void;
  onDelete: (id: string) => void;
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

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Cerrar disposiciones"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed z-50 w-64 rounded border border-line bg-surface-raised p-2 text-left shadow-lg"
        style={{ top, left }}
      >
        <form onSubmit={submit} className="flex gap-1">
          <input
            value={name}
            placeholder="Nombre"
            onChange={(event) => onName(event.target.value)}
            className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs outline-none"
          />
          <button
            type="submit"
            className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-overlay"
          >
            Guardar
          </button>
        </form>
        {presets.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted">
            Todavía no hay disposiciones guardadas.
          </p>
        ) : (
          <ul className="mt-1">
            {presets.map((preset) => (
              <li key={preset.id} className="flex items-center">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onApply(preset)}
                  className="min-w-0 flex-1 truncate px-1 py-1.5 text-left text-xs hover:bg-surface-overlay"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${preset.name}`}
                  title={`Borrar ${preset.name}`}
                  onClick={() => onDelete(preset.id)}
                  className="rounded p-1 text-muted hover:bg-surface-overlay hover:text-text"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>,
    document.body,
  );
}
