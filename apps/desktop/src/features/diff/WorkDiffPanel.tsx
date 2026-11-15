import type { WorkDiff } from "@githydra/contracts";
import { useEffect, useState } from "react";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";

export interface WorkFile {
  path: string;
  staged: boolean;
}

type DiffView = "unido" | "lados" | "antes" | "despues";

const VIEWS: { id: DiffView; label: string }[] = [
  { id: "unido", label: "Unido" },
  { id: "lados", label: "Lado a lado" },
  { id: "antes", label: "Antes" },
  { id: "despues", label: "Después" },
];

export function WorkDiffPanel({
  path,
  file,
  onSelect,
}: {
  path: string;
  file: WorkFile;
  onSelect: (file: WorkFile) => void;
}) {
  const [diff, setDiff] = useState<WorkDiff | null>(null);
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DiffView>("lados");
  const index = files.findIndex(
    (entry) => entry.path === file.path && entry.staged === file.staged,
  );

  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    setError(null);
    tauriGit
      .workingTreeStatus(path)
      .then((status) => {
        if (!cancelled) {
          setFiles(
            status.entries.map((entry) => ({
              path: entry.path,
              staged: entry.staged,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
        }
      });
    tauriGit
      .workingTreeDiff(path, file.path, file.staged)
      .then((next) => {
        if (!cancelled) {
          setDiff(next);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toGitClientError(reason).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, file.path, file.staged]);

  function step(direction: -1 | 1) {
    if (files.length === 0) {
      return;
    }
    const next =
      index < 0 ? 0 : (index + direction + files.length) % files.length;
    const chosen = files[next];
    if (chosen) {
      onSelect(chosen);
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={file.path}
        >
          {file.path}
          <span className="ml-2 text-muted">
            {file.staged ? "en stage" : "sin stage"}
          </span>
        </p>
        <div className="flex gap-1">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`rounded px-2 py-1 text-[11px] ${
                view === item.id ? "bg-surface-overlay text-text" : "text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded px-2 py-1 text-[11px] text-accent"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded px-2 py-1 text-[11px] text-accent"
          >
            Siguiente
          </button>
        </div>
      </header>
      {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
      {!diff && !error ? (
        <p className="px-3 py-2 text-xs text-muted">Leyendo el cambio…</p>
      ) : null}
      {diff ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {view === "unido" ? <UnifiedPatch patch={diff.patch} /> : null}
          {view === "lados" ? (
            <SplitPatch
              before={diff.before}
              after={diff.after}
              patch={diff.patch}
            />
          ) : null}
          {view === "antes" ? <PlainText text={diff.before} /> : null}
          {view === "despues" ? <PlainText text={diff.after} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function UnifiedPatch({ patch }: { patch: string }) {
  return (
    <pre className="font-mono text-[11px] leading-5 whitespace-pre-wrap">
      {patch.split("\n").map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: las líneas repetidas de un parche se distinguen por su posición
        <div key={index} className={lineColor(line)}>
          {line.length === 0 ? " " : line}
        </div>
      ))}
    </pre>
  );
}

function SplitPatch({
  before,
  after,
  patch,
}: {
  before: string;
  after: string;
  patch: string;
}) {
  const rows = splitRows(patch);
  if (rows.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-px bg-line">
        <PlainText text={before} />
        <PlainText text={after} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-px bg-line font-mono text-[11px] leading-5">
      <div className="bg-surface px-2 py-1 text-muted">Antes</div>
      <div className="bg-surface px-2 py-1 text-muted">Después</div>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: las filas del parche se distinguen por su posición
        <SplitRow key={index} row={row} />
      ))}
    </div>
  );
}

function SplitRow({ row }: { row: SplitRowModel }) {
  if (row.kind === "hunk") {
    return (
      <div className="col-span-2 bg-surface px-2 text-graph-edge">
        {row.text}
      </div>
    );
  }
  return (
    <>
      <div
        className={`px-2 whitespace-pre-wrap ${
          row.kind === "del" || row.kind === "change"
            ? "bg-warn/15 text-warn"
            : "bg-surface"
        }`}
      >
        {row.left.length === 0 ? " " : row.left}
      </div>
      <div
        className={`px-2 whitespace-pre-wrap ${
          row.kind === "add" || row.kind === "change"
            ? "bg-accent/15 text-accent"
            : "bg-surface"
        }`}
      >
        {row.right.length === 0 ? " " : row.right}
      </div>
    </>
  );
}

function PlainText({ text }: { text: string }) {
  return (
    <pre className="font-mono text-[11px] leading-5 whitespace-pre-wrap text-text">
      {text.length === 0 ? " " : text}
    </pre>
  );
}

interface SplitRowModel {
  kind: "same" | "add" | "del" | "change" | "hunk";
  left: string;
  right: string;
  text: string;
}

function splitRows(patch: string): SplitRowModel[] {
  const rows: SplitRowModel[] = [];
  for (const line of patch.split("\n")) {
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      rows.push({ kind: "hunk", left: "", right: "", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", left: "", right: line.slice(1), text: line });
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ kind: "del", left: line.slice(1), right: "", text: line });
      continue;
    }
    if (line.startsWith(" ")) {
      const text = line.slice(1);
      rows.push({ kind: "same", left: text, right: text, text: line });
    }
  }
  return pairChanges(rows);
}

function pairChanges(rows: SplitRowModel[]): SplitRowModel[] {
  const paired: SplitRowModel[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (!row) {
      break;
    }
    if (row.kind !== "del") {
      paired.push(row);
      index += 1;
      continue;
    }
    const deletions: SplitRowModel[] = [];
    while (rows[index]?.kind === "del") {
      const current = rows[index];
      if (!current) {
        break;
      }
      deletions.push(current);
      index += 1;
    }
    const additions: SplitRowModel[] = [];
    while (rows[index]?.kind === "add") {
      const current = rows[index];
      if (!current) {
        break;
      }
      additions.push(current);
      index += 1;
    }
    const count = Math.max(deletions.length, additions.length);
    for (let cursor = 0; cursor < count; cursor += 1) {
      const left = deletions[cursor]?.left ?? "";
      const right = additions[cursor]?.right ?? "";
      let kind: SplitRowModel["kind"] = "add";
      if (deletions[cursor] && additions[cursor]) {
        kind = "change";
      } else if (deletions[cursor]) {
        kind = "del";
      }
      paired.push({ kind, left, right, text: "" });
    }
  }
  return paired;
}

function lineColor(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "text-accent";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "text-warn";
  }
  if (line.startsWith("@@")) {
    return "text-graph-edge";
  }
  return "text-muted";
}
