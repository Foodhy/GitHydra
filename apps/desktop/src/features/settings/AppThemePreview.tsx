import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe,
  History,
  Plus,
  Redo2,
  Settings,
  SquareTerminal,
  Undo2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppVersion } from "../../hooks/useAppVersion";
import type { AppearanceTokens, VisualStyle } from "../../lib/appearance";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 680;
const ROW = 32;

const COMMITS = [
  {
    subject: "Ajusta la vista de preferencias",
    meta: "hace 2 min",
    sha: "a1c4e90",
    pills: ["main"],
    selected: true,
  },
  {
    subject: "Abre el archivo desde el historial",
    meta: "hace 18 min",
    sha: "b70d12a",
    pills: [] as string[],
    selected: false,
  },
  {
    subject: "Separa el acento del estilo",
    meta: "hace 1 h",
    sha: "c88aa14",
    pills: ["tema"],
    selected: false,
  },
  {
    subject: "Dibuja el grafo de ramas",
    meta: "ayer",
    sha: "d12ff03",
    pills: [] as string[],
    selected: false,
  },
  {
    subject: "Guarda el stage antes de confirmar",
    meta: "ayer",
    sha: "e4b901c",
    pills: [] as string[],
    selected: false,
  },
  {
    subject: "Primer commit",
    meta: "hace 3 días",
    sha: "f09c771",
    pills: [] as string[],
    selected: false,
  },
];

export function AppThemePreview({
  style,
  tokens,
}: {
  style: VisualStyle;
  tokens: AppearanceTokens;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const version = useAppVersion();

  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        return;
      }
      setScale(Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT));
    };
    measure(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitted = scale ?? 0;

  return (
    <div ref={frame} className="h-full min-h-0 w-full">
      <div
        className="mx-auto"
        style={{
          width: CANVAS_WIDTH * fitted,
          height: CANVAS_HEIGHT * fitted,
          opacity: scale === null ? 0 : 1,
        }}
      >
        <div
          data-theme-preview
          data-style={style.id}
          aria-hidden="true"
          className="pointer-events-none origin-top-left overflow-hidden border border-line shadow-sm"
          style={previewStyle(style, tokens, fitted)}
        >
          <PreviewChrome tokens={tokens} version={version} />
          <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1.4fr)_minmax(0,1fr)]">
            <PreviewBranches />
            <PreviewHistory tokens={tokens} />
            <PreviewStaging />
          </div>
          <PreviewTerminal tokens={tokens} />
        </div>
      </div>
    </div>
  );
}

function previewStyle(
  style: VisualStyle,
  tokens: AppearanceTokens,
  scale: number,
): CSSProperties {
  return {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    transform: `scale(${scale})`,
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.surface,
    color: tokens.text,
    borderColor: tokens.line,
    fontSize: style.id === "fino" ? "13.5px" : "13px",
    letterSpacing: style.id === "fino" ? "0.01em" : "normal",
    "--radius-ui": style.radius,
    "--color-surface": tokens.surface,
    "--color-surface-raised": tokens.surfaceRaised,
    "--color-surface-overlay": tokens.surfaceOverlay,
    "--color-line": tokens.line,
    "--color-text": tokens.text,
    "--color-muted": tokens.muted,
    "--color-accent": tokens.accent,
    "--color-accent-dim": tokens.accentDim,
    "--color-graph-edge": tokens.graphEdge,
    "--color-warn": tokens.warn,
  } as CSSProperties;
}

function PreviewChrome({
  tokens,
  version,
}: {
  tokens: AppearanceTokens;
  version: string;
}) {
  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-surface-raised px-2">
        <span className="flex h-6 items-center rounded bg-surface-overlay px-2 text-xs text-text">
          GitHydra
          <X size={12} className="ml-1 text-muted" />
        </span>
        <span className="flex h-6 items-center px-2 text-xs text-muted">
          notas
          <X size={12} className="ml-1" />
        </span>
        <span className="ml-auto px-2 text-sm text-muted">+</span>
      </div>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-3">
        <FolderGit2 size={18} style={{ color: tokens.accent }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">GitHydra</p>
          <p className="truncate text-[11px] text-muted">main</p>
        </div>
        <div className="mx-auto flex items-center gap-0.5">
          <ToolbarIcon label="Deshacer">
            <Undo2 size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Rehacer">
            <Redo2 size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Fetch" active>
            <CloudDownload size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Pull" active>
            <ArrowDownToLine size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Push" active>
            <ArrowUpFromLine size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Branch">
            <GitBranch size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Stash">
            <Archive size={16} />
          </ToolbarIcon>
          <ToolbarIcon label="Terminal">
            <SquareTerminal size={16} />
          </ToolbarIcon>
        </div>
        <Settings size={16} className="text-muted" />
        <span className="font-mono text-[11px] text-muted">v{version}</span>
      </header>
    </>
  );
}

function ToolbarIcon({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className={`rounded-md p-1.5 ${active ? "text-text" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

function PreviewBranches() {
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-surface-raised">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <input
          readOnly
          tabIndex={-1}
          value=""
          placeholder="Filtrar ramas"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted"
        />
        <Plus size={14} className="text-muted" />
      </div>
      <div className="min-h-0 flex-1 py-1">
        <p className="px-3 py-1 text-xs text-muted">Local</p>
        <BranchLine name="main" head />
        <BranchLine name="tema" />
        <BranchLine name="editor" />
        <p className="mt-2 px-3 py-1 text-xs text-muted">origin</p>
        <BranchLine name="main" indent />
        <BranchLine name="tema" indent />
      </div>
    </aside>
  );
}

function BranchLine({
  name,
  head = false,
  indent = false,
}: {
  name: string;
  head?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex h-7 items-center gap-2 text-xs ${
        indent ? "pr-3 pl-8" : "px-3"
      } ${head ? "bg-accent-dim text-accent" : "text-text"}`}
    >
      <GitBranch size={13} className="shrink-0" />
      <span className="truncate">{name}</span>
    </div>
  );
}

function PreviewHistory({ tokens }: { tokens: AppearanceTokens }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col border-r border-line">
      <div className="flex gap-1 border-b border-line px-2 py-1">
        <button
          type="button"
          tabIndex={-1}
          className="flex items-center gap-1.5 rounded bg-surface-overlay px-2 py-1 text-xs text-text"
        >
          <History size={13} />
          Historial
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted"
        >
          <FileCode2 size={13} />
          Editor
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted"
        >
          <Globe size={13} />
          Browser
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex">
          <PreviewGraph tokens={tokens} />
          <ul className="min-w-0 flex-1">
            {COMMITS.map((commit) => (
              <li key={commit.sha}>
                <div
                  className={`box-border flex items-center gap-2 overflow-hidden border-b border-line/70 px-3 ${
                    commit.selected
                      ? "bg-accent-dim shadow-[inset_2px_0_0_var(--color-accent)]"
                      : ""
                  }`}
                  style={{ height: ROW }}
                >
                  <p className="min-w-0 flex-1 truncate text-xs">
                    {commit.subject}
                  </p>
                  {commit.pills.map((pill) => (
                    <span
                      key={pill}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color:
                          pill === "main" ? tokens.accent : tokens.graphEdge,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          background:
                            pill === "main" ? tokens.accent : tokens.graphEdge,
                        }}
                      />
                      {pill}
                    </span>
                  ))}
                  <span className="shrink-0 text-[11px] text-muted">
                    {commit.meta}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {commit.sha}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <PreviewDiff />
      </div>
    </section>
  );
}

function PreviewGraph({ tokens }: { tokens: AppearanceTokens }) {
  const y = (row: number) => row * ROW + ROW / 2;
  const c0 = 16;
  const c1 = 36;
  return (
    <svg
      width={52}
      height={COMMITS.length * ROW}
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d={`M ${c0} ${y(0)} L ${c0} ${y(COMMITS.length - 1)}`}
        fill="none"
        stroke={tokens.graphEdge}
        strokeWidth={2}
      />
      <path
        d={`M ${c0} ${y(1)} C ${c0} ${y(1) + 16}, ${c1} ${y(2) - 16}, ${c1} ${y(2)} L ${c1} ${y(3)} C ${c1} ${y(3) + 16}, ${c0} ${y(4) - 16}, ${c0} ${y(4)}`}
        fill="none"
        stroke={tokens.accent}
        strokeWidth={2}
      />
      <circle cx={c0} cy={y(0)} r={5.5} fill={tokens.accent} />
      <circle cx={c0} cy={y(1)} r={4.5} fill={tokens.graphEdge} />
      <circle cx={c1} cy={y(2)} r={4.5} fill={tokens.accent} />
      <circle cx={c1} cy={y(3)} r={4.5} fill={tokens.accent} />
      <circle cx={c0} cy={y(4)} r={4.5} fill={tokens.graphEdge} />
      <circle cx={c0} cy={y(5)} r={4.5} fill={tokens.graphEdge} />
    </svg>
  );
}

function PreviewDiff() {
  return (
    <div className="shrink-0 border-t border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <p className="font-mono text-[11px] text-text">
          apps/desktop/src/lib/appearance.ts
        </p>
        <span className="text-[11px] text-accent">Cerrar</span>
      </div>
      <div className="font-mono text-[11px] leading-5">
        <p className="bg-warn/15 px-3 text-warn">- accent: "#3ee0b0",</p>
        <p className="bg-accent/15 px-3 text-accent">+ accent: "#5b8cff",</p>
        <p className="px-3 text-muted"> surface: "#12141a",</p>
      </div>
    </div>
  );
}

function PreviewStaging() {
  return (
    <aside className="flex min-h-0 flex-col bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-xs text-muted">3 cambios en el árbol</p>
        <p className="mt-1 text-xs text-muted">Filtrar archivos</p>
      </header>
      <div className="min-h-0 flex-1">
        <FileGroup title="Sin stage" count="2">
          <FileLine mark="M" tone="text-graph-edge" name="appearance.ts" />
          <FileLine mark="D" tone="text-warn" name="notes.txt" action="Stage" />
        </FileGroup>
        <FileGroup title="En stage" count="1">
          <FileLine
            mark="A"
            tone="text-accent"
            name="SettingsPage.tsx"
            selected
            action="Quitar"
          />
        </FileGroup>
      </div>
      <div className="border-t border-line p-3">
        <input
          readOnly
          tabIndex={-1}
          value="Muestra la app al elegir estilo"
          className="mb-2 w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
        />
        <textarea
          readOnly
          tabIndex={-1}
          rows={2}
          placeholder="Descripción"
          className="mb-2 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          tabIndex={-1}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-surface"
        >
          Confirmar
        </button>
      </div>
    </aside>
  );
}

function FileGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs text-muted">
          {title}
          <span className="ml-2">{count}</span>
        </h2>
        <span className="text-[11px] text-accent">Todos</span>
      </div>
      <ul className="pb-2">{children}</ul>
    </section>
  );
}

function FileLine({
  mark,
  tone,
  name,
  selected = false,
  action = "Stage",
}: {
  mark: string;
  tone: string;
  name: string;
  selected?: boolean;
  action?: string;
}) {
  return (
    <li
      className={`flex h-7 items-center ${selected ? "bg-surface-overlay" : ""}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 px-3 font-mono text-xs">
        <span className={`w-4 shrink-0 ${tone}`}>{mark}</span>
        <span className="truncate">{name}</span>
      </span>
      <span className="px-2 text-[11px] text-accent">{action}</span>
    </li>
  );
}

function PreviewTerminal({ tokens }: { tokens: AppearanceTokens }) {
  return (
    <div
      className="shrink-0 border-t border-line px-3 py-2 font-mono text-[12px] leading-5"
      style={{ background: tokens.surface, height: 118 }}
    >
      <p className="text-muted">Terminal · GitHydra</p>
      <p>
        <span style={{ color: tokens.accent }}>❯</span> git status
      </p>
      <p className="text-muted">## main...origin/main</p>
      <p>
        <span className="text-graph-edge"> M</span> src/lib/appearance.ts
      </p>
      <p>
        <span className="text-warn"> D</span> notes.txt
      </p>
    </div>
  );
}
