import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import {
  listWorkdir,
  searchWorkdir,
  type WorkdirEntry,
} from "../../lib/workdir";
import { FileGlyph } from "./FileGlyph";

export function Explorer({
  path,
  revision,
  activePath,
  onOpen,
}: {
  path: string;
  revision: number;
  activePath: string | null;
  onOpen: (file: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [cache, setCache] = useState<Record<string, WorkdirEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const folders = Object.entries(open)
    .filter(([, isOpen]) => isOpen)
    .map(([directory]) => directory)
    .sort();
  const openKey = folders.join("|");
  const needle = query.trim();

  useEffect(() => {
    let cancelled = false;
    const generation = revision;
    const directories = openKey.split("|");
    for (const directory of directories) {
      listWorkdir(path, directory)
        .then((entries) => {
          if (!cancelled && generation === revision) {
            setCache((current) => ({ ...current, [directory]: entries }));
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled && generation === revision) {
            setError(toGitClientError(reason).message);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [path, revision, openKey]);

  useEffect(() => {
    if (!needle) {
      setResults(null);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const generation = revision;
    const handle = setTimeout(() => {
      searchWorkdir(path, needle)
        .then((paths) => {
          if (!cancelled && generation === revision) {
            setResults(paths);
            setSearchError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled && generation === revision) {
            setResults([]);
            setSearchError(toGitClientError(reason).message);
          }
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [path, needle, revision]);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">Explorador</p>
        <input
          value={query}
          placeholder="Buscar archivos"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
            }
          }}
          className="mt-1 w-full bg-transparent text-xs outline-none placeholder:text-muted"
        />
      </header>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {error ? (
          <p className="px-3 py-1 text-[11px] text-warn">{error}</p>
        ) : null}
        {needle ? (
          <SearchResults
            results={results}
            error={searchError}
            activePath={activePath}
            onOpen={onOpen}
          />
        ) : (
          <TreeLevel
            directory=""
            depth={0}
            cache={cache}
            open={open}
            activePath={activePath}
            onToggle={(directory) =>
              setOpen((current) => ({
                ...current,
                [directory]: !current[directory],
              }))
            }
            onOpen={onOpen}
          />
        )}
      </div>
    </aside>
  );
}

function SearchResults({
  results,
  error,
  activePath,
  onOpen,
}: {
  results: string[] | null;
  error: string | null;
  activePath: string | null;
  onOpen: (file: string) => void;
}) {
  if (error) {
    return <p className="px-3 py-1 text-[11px] text-warn">{error}</p>;
  }
  if (!results) {
    return <p className="px-3 py-1 text-[11px] text-muted">Buscando…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="px-3 py-1 text-[11px] text-muted">Sin coincidencias</p>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {results.map((file) => (
        <li key={file}>
          <button
            type="button"
            title={file}
            onClick={() => onOpen(file)}
            className={`flex w-full min-w-0 items-center gap-1.5 px-3 py-1 text-left font-mono text-[11px] hover:bg-surface-overlay ${
              file === activePath
                ? "bg-surface-overlay text-text"
                : "text-muted"
            }`}
          >
            <FileGlyph path={file} kind="file" />
            <span className="min-w-0 flex-1 truncate">{file}</span>
          </button>
        </li>
      ))}
      {results.length === 80 ? (
        <li className="px-3 py-1 text-[11px] text-muted">
          Mostrando las primeras 80 coincidencias.
        </li>
      ) : null}
    </ul>
  );
}

function TreeLevel({
  directory,
  depth,
  cache,
  open,
  activePath,
  onToggle,
  onOpen,
}: {
  directory: string;
  depth: number;
  cache: Record<string, WorkdirEntry[]>;
  open: Record<string, boolean>;
  activePath: string | null;
  onToggle: (directory: string) => void;
  onOpen: (file: string) => void;
}) {
  const entries = cache[directory];
  if (!entries) {
    return <p className="px-3 py-1 text-[11px] text-muted">Leyendo…</p>;
  }
  if (entries.length === 0) {
    return <p className="px-3 py-1 text-[11px] text-muted">Carpeta vacía</p>;
  }
  return (
    <ul className="m-0 list-none p-0">
      {entries.map((entry) => {
        const expanded = open[entry.path] === true;
        return (
          <li key={entry.path}>
            <button
              type="button"
              title={entry.path}
              onClick={() =>
                entry.kind === "dir" ? onToggle(entry.path) : onOpen(entry.path)
              }
              className={`flex h-7 w-full min-w-0 items-center gap-1 overflow-hidden text-left text-xs hover:bg-surface-overlay ${
                entry.path === activePath
                  ? "bg-surface-overlay text-text"
                  : "text-muted"
              }`}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {entry.kind === "dir" ? (
                expanded ? (
                  <ChevronDown size={12} className="shrink-0" />
                ) : (
                  <ChevronRight size={12} className="shrink-0" />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <FileGlyph path={entry.path} kind={entry.kind} open={expanded} />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
            {entry.kind === "dir" && expanded ? (
              <TreeLevel
                directory={entry.path}
                depth={depth + 1}
                cache={cache}
                open={open}
                activePath={activePath}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
