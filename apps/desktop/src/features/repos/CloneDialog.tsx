import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { adoptRepository } from "../../lib/repo-actions";
import {
  canCancel,
  cancelOperation,
  runOperation,
} from "../../lib/run-operation";
import { useCommandUi } from "../../stores/command-ui";
import { useOperation } from "../../stores/operation";

export function CloneDialog() {
  const openDialog = useCommandUi((state) => state.cloneOpen);
  const close = useCommandUi((state) => state.closeClone);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useOperation((state) => state.detail);
  const kind = useOperation((state) => state.kind);

  if (!openDialog) {
    return null;
  }

  async function submit() {
    const nextUrl = url.trim();
    if (!nextUrl || busy) {
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Carpeta donde clonar",
    });
    if (typeof selected !== "string") {
      return;
    }
    setBusy(true);
    setError(null);
    await runOperation(
      "clone",
      "Clonando",
      async () => {
        const repo = await tauriGit.cloneRepository(nextUrl, selected);
        await adoptRepository(repo);
      },
      async () => {},
    );
    setBusy(false);
    const notice = useOperation.getState().notice;
    if (notice) {
      setError(notice);
      return;
    }
    setUrl("");
    close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <form
        className="w-full max-w-lg rounded border border-line bg-surface-raised p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-sm font-medium">Clonar repositorio</h2>
        <p className="mt-1 text-xs text-muted">
          Pega la URL y elige la carpeta padre. El clon se abre en una pestaña.
        </p>
        {error ? <p className="mt-3 text-xs text-warn">{error}</p> : null}
        {busy && kind === "clone" ? (
          <p className="mt-3 text-xs text-muted">
            {detail ? `Clonando · ${detail}` : "Clonando…"}
          </p>
        ) : null}
        <input
          value={url}
          disabled={busy}
          placeholder="https://… o git@…"
          onChange={(event) => setUrl(event.target.value)}
          className="mt-3 w-full rounded border border-line bg-surface px-3 py-2 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy && !canCancel(kind)}
            onClick={() => {
              if (busy) {
                void cancelOperation();
                return;
              }
              close();
            }}
            className="rounded px-3 py-1.5 text-sm text-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || url.trim().length === 0}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
          >
            Elegir carpeta
          </button>
        </div>
      </form>
    </div>
  );
}
