import type { WorkDiff } from "@githydra/contracts";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileMinus,
  FilePlus,
  type LucideIcon,
  Pencil,
  Rows3,
} from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { discardPrompt } from "../../lib/discard-prompt";
import { toGitClientError } from "../../lib/git/errors";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { type MessageKey, t, useT } from "../../lib/i18n";
import { CodeDiff, noteOf, sideText } from "./CodeDiff";

export interface WorkFile {
  path: string;
  staged: boolean;
}

type DiffView = "unido" | "lados" | "antes" | "despues";

const VIEWS: { id: DiffView; label: MessageKey; icon: LucideIcon }[] = [
  { id: "unido", label: "diff.unified", icon: Rows3 },
  { id: "lados", label: "diff.side", icon: Columns2 },
  { id: "antes", label: "diff.before", icon: FileMinus },
  { id: "despues", label: "diff.after", icon: FilePlus },
];

export function WorkDiffPanel({
  path,
  file,
  onSelect,
  onEdit,
  onDiscarded,
  onRepositoryChanged,
}: {
  path: string;
  file: WorkFile;
  onSelect: (file: WorkFile) => void;
  onEdit: (file: string) => void;
  onDiscarded: () => void;
  onRepositoryChanged: () => Promise<void>;
}) {
  useT();
  const [diff, setDiff] = useState<WorkDiff | null>(null);
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DiffView>("lados");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
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

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  }

  async function moveStage() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (file.staged) {
        await tauriGit.unstagePaths(path, [file.path]);
      } else {
        await tauriGit.stagePaths(path, [file.path]);
      }
      onSelect({ path: file.path, staged: !file.staged });
      await onRepositoryChanged();
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    const kind = diff?.kind ?? (file.staged ? "added" : "modified");
    if (busy || !window.confirm(discardPrompt(file.path, kind))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await tauriGit.discardPaths(path, [file.path]);
      await onRepositoryChanged();
      onDiscarded();
    } catch (reason: unknown) {
      setError(toGitClientError(reason).message);
      setBusy(false);
    }
  }

  function menuItems(): MenuItem[] {
    return [
      {
        id: "stage",
        label: file.staged ? "Quitar del stage" : "Stage",
        disabled: busy,
        onSelect: () => {
          void moveStage();
        },
      },
      {
        id: "discard",
        label: "Descartar cambios",
        danger: true,
        disabled: busy,
        onSelect: () => {
          void discard();
        },
      },
    ];
  }

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
    <section
      className="flex h-full min-w-0 flex-col"
      onContextMenuCapture={openMenu}
    >
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
        <button
          type="button"
          onClick={() => onEdit(file.path)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-accent"
        >
          <Pencil size={12} />
          {t("diff.edit")}
        </button>
        <div className="flex gap-1">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${
                  view === item.id
                    ? "bg-surface-overlay text-text"
                    : "text-muted"
                }`}
              >
                <Icon size={12} />
                {t(item.label)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-accent"
          >
            <ChevronLeft size={12} />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-accent"
          >
            Siguiente
            <ChevronRight size={12} />
          </button>
        </div>
      </header>
      {error ? <p className="px-3 py-2 text-xs text-warn">{error}</p> : null}
      {!diff && !error ? (
        <p className="px-3 py-2 text-xs text-muted">Leyendo el cambio…</p>
      ) : null}
      {diff ? (
        <div className="min-h-0 flex-1">
          <WorkBody file={file.path} diff={diff} view={view} />
        </div>
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems()}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </section>
  );
}

function WorkBody({
  file,
  diff,
  view,
}: {
  file: string;
  diff: WorkDiff;
  view: DiffView;
}) {
  const note = diff.binary
    ? noteOf(diff.patch) ||
      noteOf(diff.before) ||
      noteOf(diff.after) ||
      diff.patch
    : noteOf(diff.before) || noteOf(diff.after);
  if (note) {
    return <p className="px-3 py-2 text-xs text-muted">{note}</p>;
  }
  return (
    <CodeDiff
      filePath={file}
      before={sideText(diff.before)}
      after={sideText(diff.after)}
      mode={view}
    />
  );
}
