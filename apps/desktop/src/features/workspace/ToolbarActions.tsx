import type { StashEntry } from "@githydra/contracts";
import { Archive, GitBranch } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToolButton } from "../../components/ToolButton";
import { formatWhen } from "../../lib/format";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { runOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import { useOverlay } from "../../stores/overlay";

export function BranchButton({
  path,
  onRepositoryChanged,
}: {
  path: string;
  onRepositoryChanged: () => Promise<void>;
}) {
  const running = useOperation((state) => state.running);
  const notice = useOperation((state) => state.notice);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [name, setName] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || useOperation.getState().running) {
      return;
    }
    await runOperation(
      "other",
      "Creando rama",
      () => tauriGit.createBranch(path, nextName),
      onRepositoryChanged,
    );
    if (useOperation.getState().notice) {
      return;
    }
    setName("");
    setMenu(null);
  }

  return (
    <>
      <ToolButton
        label="Branch"
        pressed={menu !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu((current) => (current ? null : anchorAt(rect, 240)));
        }}
      >
        <GitBranch size={16} />
      </ToolButton>
      {menu ? (
        <AnchoredPopover
          top={menu.top}
          left={menu.left}
          label="Nueva rama"
          width="w-60"
          onClose={() => setMenu(null)}
        >
          <form onSubmit={(event) => void create(event)} className="grid gap-2">
            <input
              value={name}
              disabled={running}
              placeholder="Nueva rama"
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded border border-line bg-surface px-2 py-1 text-xs outline-none"
            />
            {notice ? <p className="text-[11px] text-warn">{notice}</p> : null}
            <button
              type="submit"
              disabled={running || name.trim().length === 0}
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-surface disabled:opacity-40"
            >
              Crear
            </button>
          </form>
        </AnchoredPopover>
      ) : null}
    </>
  );
}

export function StashButton({
  path,
  onRepositoryChanged,
}: {
  path: string;
  onRepositoryChanged: () => Promise<void>;
}) {
  const running = useOperation((state) => state.running);
  const notice = useOperation((state) => state.notice);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [entries, setEntries] = useState<StashEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!menu) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    tauriGit
      .listStashes(path)
      .then((next) => {
        if (!cancelled) {
          setEntries(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toGitClientError(reason).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menu, path]);

  async function run(label: string, action: () => Promise<void>) {
    if (useOperation.getState().running) {
      return;
    }
    await runOperation("other", label, action, onRepositoryChanged);
    try {
      setEntries(await tauriGit.listStashes(path));
      setError(null);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    }
  }

  return (
    <>
      <ToolButton
        label="Stash"
        pressed={menu !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu((current) => (current ? null : anchorAt(rect, 288)));
        }}
      >
        <Archive size={16} />
      </ToolButton>
      {menu ? (
        <AnchoredPopover
          top={menu.top}
          left={menu.left}
          label="Stash"
          width="w-72"
          onClose={() => setMenu(null)}
        >
          <div className="mb-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={running}
              onClick={() => {
                void run("Guardando reserva", () =>
                  tauriGit.saveStash(path, "", false),
                );
              }}
              className="rounded border border-line px-2 py-1 text-[11px] hover:bg-surface-overlay disabled:opacity-40"
            >
              Guardar cambios
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => {
                void run("Guardando reserva", () =>
                  tauriGit.saveStash(path, "", true),
                );
              }}
              className="rounded border border-line px-2 py-1 text-[11px] hover:bg-surface-overlay disabled:opacity-40"
            >
              Incluir archivos nuevos
            </button>
          </div>
          {notice ? (
            <p className="mb-2 text-[11px] text-warn">{notice}</p>
          ) : null}
          {error ? <p className="mb-2 text-[11px] text-warn">{error}</p> : null}
          {loading && entries.length === 0 ? (
            <p className="text-[11px] text-muted">Cargando…</p>
          ) : null}
          {!loading && entries.length === 0 && !error ? (
            <p className="text-[11px] text-muted">No hay reservas.</p>
          ) : null}
          {entries.length > 0 ? (
            <ul className="m-0 max-h-64 list-none overflow-auto p-0">
              {entries.map((entry) => (
                <li key={`${entry.index}-${entry.stashedAt}`} className="mb-2">
                  <p className="truncate text-xs" title={entry.message}>
                    {entry.message}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {entry.branch ?? "sin rama"} · {formatWhen(entry.stashedAt)}
                  </p>
                  <div className="mt-1 flex gap-2 text-[11px]">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        void run("Aplicando reserva", () =>
                          tauriGit.applyStash(path, entry.index),
                        );
                      }}
                      className="text-accent disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        void run("Trayendo reserva", () =>
                          tauriGit.popStash(path, entry.index),
                        );
                      }}
                      className="text-accent disabled:opacity-40"
                    >
                      Traer
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        void run("Eliminando reserva", () =>
                          tauriGit.dropStash(path, entry.index),
                        );
                      }}
                      className="text-warn disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </AnchoredPopover>
      ) : null}
    </>
  );
}

function anchorAt(rect: DOMRect, width: number): { top: number; left: number } {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  return { top: rect.bottom + 6, left };
}

function AnchoredPopover({
  top,
  left,
  label,
  width,
  onClose,
  children,
}: {
  top: number;
  left: number;
  label: string;
  width: string;
  onClose: () => void;
  children: ReactNode;
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
        aria-label={`Cerrar ${label}`}
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={label}
        className={`fixed z-50 ${width} rounded border border-line bg-surface-raised p-2 text-left shadow-lg`}
        style={{ top, left }}
      >
        <p className="mb-2 text-[11px] text-muted">{label}</p>
        {children}
      </div>
    </>,
    document.body,
  );
}
