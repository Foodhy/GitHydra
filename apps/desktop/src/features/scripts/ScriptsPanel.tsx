import {
  type ProjectScripts,
  pinScript,
  putScript,
  removeScript,
} from "@githydra/contracts";
import { Pin, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import {
  loadProjectScripts,
  saveProjectScripts,
} from "../../lib/project-scripts";
import { pushRun } from "../terminal/run";
import { loadTerminals, type TerminalTab } from "../terminal/sessions";

export function ScriptsPanel({
  path,
  revision,
  onRepositoryChanged,
}: {
  path: string;
  revision: number;
  onRepositoryChanged: () => Promise<void>;
}) {
  const [book, setBook] = useState<ProjectScripts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [menu, setMenu] = useState<{
    command: string;
    tabs: TerminalTab[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const current = revision;
    loadProjectScripts(path)
      .then((next) => {
        if (!cancelled && current === revision) {
          setBook(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : toGitClientError(reason).message,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  async function store(next: ProjectScripts) {
    await saveProjectScripts(path, next);
    setBook(next);
    setError(null);
    await onRepositoryChanged();
  }

  async function add() {
    if (!book) {
      return;
    }
    const next = putScript(book, name.trim(), command.trim());
    if ("error" in next) {
      setError(next.error);
      return;
    }
    try {
      await store(next.book);
      setName("");
      setCommand("");
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    }
  }

  async function change(
    next: { book: ProjectScripts } | { error: string } | ProjectScripts,
  ) {
    const bookNext = "error" in next ? null : "book" in next ? next.book : next;
    if (!bookNext) {
      if ("error" in next) {
        setError(next.error);
      }
      return;
    }
    try {
      await store(bookNext);
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    }
  }

  const names = book ? Object.keys(book.scripts).sort() : [];

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">Scripts</p>
        <p className="truncate text-[11px] text-muted">
          .githydra/scripts.json
        </p>
      </header>
      {error ? (
        <p className="border-b border-line px-3 py-1 text-[11px] text-warn">
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {book && names.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">
            Agrega un comando para correrlo en una terminal.
          </p>
        ) : null}
        <ul className="m-0 list-none p-0">
          {names.map((script) => {
            const pinned = book?.pinned.includes(script) ?? false;
            return (
              <li
                key={script}
                className="flex items-center gap-1 border-b border-line px-2 py-1"
              >
                <button
                  type="button"
                  title={
                    pinned ? "Quitar de la terminal" : "Fijar en la terminal"
                  }
                  aria-pressed={pinned}
                  onClick={() => {
                    if (book) {
                      void change(pinScript(book, script, !pinned));
                    }
                  }}
                  className={`rounded p-1 ${pinned ? "text-accent" : "text-muted"}`}
                >
                  <Pin size={13} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-text">{script}</p>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {book?.scripts[script]}
                  </p>
                </div>
                <button
                  type="button"
                  title="Correr"
                  aria-label={`Correr ${script}`}
                  onClick={() => {
                    const command = book?.scripts[script];
                    if (!command) {
                      return;
                    }
                    setMenu({
                      command,
                      tabs: loadTerminals(localStorage, path),
                    });
                  }}
                  className="rounded p-1 text-text hover:bg-surface-overlay"
                >
                  <Play size={13} />
                </button>
                <button
                  type="button"
                  title="Borrar"
                  aria-label={`Borrar ${script}`}
                  onClick={() => {
                    if (book) {
                      void change(removeScript(book, script));
                    }
                  }}
                  className="rounded p-1 text-muted hover:text-warn"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <form
        className="grid gap-1 border-t border-line p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={name}
          placeholder="Nombre"
          aria-label="Nombre del script"
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-line bg-transparent px-2 py-1 text-xs outline-none"
        />
        <input
          value={command}
          placeholder="Comando"
          aria-label="Comando"
          onChange={(event) => setCommand(event.target.value)}
          className="rounded border border-line bg-transparent px-2 py-1 font-mono text-xs outline-none"
        />
        <button
          type="submit"
          className="rounded bg-accent px-2 py-1 text-xs font-medium text-surface"
        >
          Agregar
        </button>
      </form>
      {menu ? (
        <div className="border-t border-line p-2">
          <p className="mb-1 text-[11px] text-muted">Correr en</p>
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-overlay"
            onClick={() => {
              pushRun({ tabId: "new", command: menu.command, clear: false });
              setMenu(null);
            }}
          >
            Nueva terminal
          </button>
          {menu.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-overlay"
              onClick={() => {
                pushRun({ tabId: tab.id, command: menu.command, clear: false });
                setMenu(null);
              }}
            >
              {tab.name}
            </button>
          ))}
          <button
            type="button"
            className="mt-1 text-[11px] text-muted"
            onClick={() => setMenu(null)}
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </section>
  );
}
