import { invoke } from "@tauri-apps/api/core";
import {
  FileCode2,
  FileDiff,
  GitBranch,
  Globe,
  History,
  type LucideIcon,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useFileIndex } from "../../hooks/useFileIndex";
import { useRepoSync } from "../../hooks/useRepoSync";
import {
  bindScriptsPanel,
  bindTerminalPanel,
  syncWindowPanels,
} from "../../lib/file-menu";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { useT } from "../../lib/i18n";
import { useCommandUi } from "../../stores/command-ui";
import { useOverlay } from "../../stores/overlay";
import { useRepoSession } from "../../stores/repo-session";
import { BranchPanel } from "../branches/BranchPanel";
import {
  BrowserPanel,
  clearBrowserPage,
  markBrowserClosed,
  useBrowserLabel,
} from "../browser/BrowserPanel";
import { CommitDiffPanel } from "../diff/CommitDiffPanel";
import { WorkDiffPanel, type WorkFile } from "../diff/WorkDiffPanel";
import { EditorPanel } from "../editor/EditorPanel";
import { QuickOpen } from "../editor/QuickOpen";
import { HistoryPanel } from "../history/HistoryPanel";
import { ScriptsPanel } from "../scripts/ScriptsPanel";
import { StagingPanel } from "../staging/StagingPanel";
import { TERMINAL_RUN } from "../terminal/run";
import { TerminalSlot, useTerminalHost } from "../terminal/TerminalChrome";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { CursorConnectStrip } from "./CursorConnectStrip";
import { bindCenterViews } from "./center-views";
import { loadProjectTree, writeProjectTree } from "./layout-presets";
import {
  activate,
  centerOpen,
  closePanel,
  type DropZone,
  findPane,
  type LayoutNode,
  openPanel,
  type PanelId,
  panelLabel,
  place,
  restoreTerminal,
  setRatio,
} from "./layout-tree";
import { TopBar } from "./TopBar";
import { PaneBody, PaneTabs } from "./ViewPane";

const PANEL_ICON: Record<PanelId, LucideIcon> = {
  branches: GitBranch,
  history: History,
  editor: FileCode2,
  browser: Globe,
  changes: FileDiff,
  terminal: SquareTerminal,
  scripts: ScrollText,
};

export function WorkspaceShell({ path }: { path: string }) {
  const setInfo = useRepoSession((state) => state.setInfo);
  const [revision, setRevision] = useState(0);
  const [cueNotice, setCueNotice] = useState<string | null>(null);
  const tr = useT();
  const [tree, setTree] = useState<LayoutNode>(() =>
    loadProjectTree(localStorage, path),
  );
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [workFile, setWorkFile] = useState<WorkFile | null>(null);
  const [editorTarget, setEditorTarget] = useState<{
    file: string;
    sha: string | null;
    id: number;
  } | null>(null);
  const editorRequest = useRef(0);
  const [trackedPath, setTrackedPath] = useState(path);
  const { container, ready, assignSlot } = useTerminalHost();
  const browserHost = useKeptHost();
  if (trackedPath !== path) {
    setTrackedPath(path);
    setTree(loadProjectTree(localStorage, path));
    setSelectedSha(null);
    setEditorTarget(null);
    setWorkFile(null);
  }

  const openTarget = useCallback(
    (file: string, sha: string | null, focus: boolean) => {
      editorRequest.current += 1;
      setEditorTarget({ file, sha, id: editorRequest.current });
      if (focus) {
        setTree((current) => openPanel(current, "editor"));
      }
    },
    [],
  );
  const previewCommitFile = useCallback(
    (file: string) => {
      if (!selectedSha) {
        return;
      }
      openTarget(file, selectedSha, false);
    },
    [openTarget, selectedSha],
  );
  const editWorkFile = useCallback(
    (file: string) => {
      openTarget(file, null, true);
    },
    [openTarget],
  );
  const quickOpen = useCommandUi((state) => state.quickOpen);
  const quickOpenTick = useCommandUi((state) => state.quickOpenTick);

  useEffect(() => {
    if (!path) {
      return;
    }
    useCommandUi.getState().hideQuickOpen();
    return () => {
      useCommandUi.getState().hideQuickOpen();
    };
  }, [path]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "p") {
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const showing = useCommandUi.getState().quickOpen;
      const overlay = useOverlay.getState().depth;
      if (overlay > (showing ? 1 : 0)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      useCommandUi.getState().showQuickOpen();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function refreshRepository() {
    const repo = await tauriGit.openRepository(path);
    setInfo(repo);
    const show = await tauriGit.takeShowDiff(path).catch(() => null);
    setRevision((current) => current + 1);
    if (!show) {
      return;
    }
    if (show.missing) {
      setCueNotice(tr("stage.notInTree", { file: show.file }));
      return;
    }
    setCueNotice(null);
    setSelectedSha(null);
    setWorkFile({ path: show.file, staged: show.staged });
    setTree((current) => openPanel(current, "history"));
  }

  useRepoSync(path, refreshRepository);

  useEffect(() => {
    return bindCenterViews((view) => {
      setTree((current) => openPanel(current, view));
    });
  }, []);

  useEffect(() => {
    return bindTerminalPanel(() => {
      setTree((current) => restoreTerminal(current));
    });
  }, []);

  useEffect(() => {
    return bindScriptsPanel(() => {
      setTree((current) => openPanel(current, "scripts"));
    });
  }, []);

  useEffect(() => {
    function onRun() {
      setTree((current) => restoreTerminal(current));
    }
    window.addEventListener(TERMINAL_RUN, onRun);
    return () => window.removeEventListener(TERMINAL_RUN, onRun);
  }, []);

  const fileIndex = useFileIndex(path, revision);

  const open = centerOpen(tree);
  const terminalOpen = findPane(tree, "terminal") !== null;
  const scriptsOpen = findPane(tree, "scripts") !== null;

  useEffect(() => {
    syncWindowPanels({
      enabled: true,
      open: {
        history: open.history,
        editor: open.editor,
        browser: open.browser,
      },
      terminal: terminalOpen,
      scripts: scriptsOpen,
    });
  }, [open.browser, open.editor, open.history, scriptsOpen, terminalOpen]);

  useEffect(() => {
    return () => {
      clearBrowserPage();
      void invoke("browser_close_all");
      syncWindowPanels({
        enabled: false,
        open: { history: false, editor: false, browser: false },
        terminal: false,
        scripts: false,
      });
    };
  }, []);

  useEffect(() => {
    if (open.browser) {
      return;
    }
    markBrowserClosed();
    void invoke("browser_close_all");
  }, [open.browser]);

  useEffect(() => {
    writeProjectTree(localStorage, trackedPath, tree);
  }, [trackedPath, tree]);

  function toggleCommit(sha: string) {
    setWorkFile(null);
    setSelectedSha((current) => (current === sha ? null : sha));
  }

  function selectWorkFile(file: WorkFile) {
    setSelectedSha(null);
    setWorkFile(file);
    setTree((current) => openPanel(current, "history"));
  }

  function activatePanel(panel: PanelId) {
    if (panel === "history") {
      setWorkFile(null);
    }
    setTree((current) => activate(current, panel));
  }

  function placePanel(panel: PanelId, targetId: string, zone: DropZone) {
    setTree((current) => place(current, panel, targetId, zone));
  }

  const browserLabel = useBrowserLabel();
  const browserActive = findPane(tree, "browser")?.active === "browser";

  const branches = (
    <BranchPanel
      path={path}
      revision={revision}
      onRepositoryChanged={refreshRepository}
    />
  );
  const history = workFile ? (
    <WorkDiffPanel
      path={path}
      file={workFile}
      onSelect={selectWorkFile}
      onEdit={editWorkFile}
      onDiscarded={() => setWorkFile(null)}
      onRepositoryChanged={refreshRepository}
    />
  ) : (
    <HistoryPanel
      path={path}
      revision={revision}
      selectedSha={selectedSha}
      onSelect={toggleCommit}
      onRepositoryChanged={refreshRepository}
    />
  );
  const changes = selectedSha ? (
    <CommitDiffPanel
      path={path}
      sha={selectedSha}
      onClear={() => setSelectedSha(null)}
      onSelectFile={previewCommitFile}
      onEdit={editWorkFile}
    />
  ) : (
    <StagingPanel
      path={path}
      revision={revision}
      selected={workFile}
      onSelect={selectWorkFile}
      onOpenFile={editWorkFile}
      onDiscarded={() => setWorkFile(null)}
      onRepositoryChanged={refreshRepository}
    />
  );

  function paneContent(panel: PanelId): ReactNode {
    if (panel === "branches") {
      return branches;
    }
    if (panel === "history") {
      return history;
    }
    if (panel === "changes") {
      return changes;
    }
    if (panel === "editor") {
      return (
        <EditorPanel
          key={path}
          path={path}
          revision={revision}
          active={findPane(tree, "editor")?.active === "editor"}
          file={editorTarget?.file ?? null}
          sha={editorTarget?.sha ?? null}
          requestId={editorTarget?.id ?? 0}
          onRepositoryChanged={refreshRepository}
          indexed={fileIndex.files}
          indexReady={fileIndex.ready}
          onRefreshIndex={fileIndex.refresh}
        />
      );
    }
    if (panel === "scripts") {
      return (
        <ScriptsPanel
          path={path}
          revision={revision}
          onRepositoryChanged={refreshRepository}
        />
      );
    }
    if (panel === "browser") {
      return (
        <div ref={browserHost.assign} className="h-full min-h-0 min-w-0" />
      );
    }
    return <TerminalSlot assign={assignSlot} />;
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        path={path}
        layout={tree}
        onApplyLayout={setTree}
        onRepositoryChanged={refreshRepository}
      />
      <CursorConnectStrip />
      {cueNotice ? (
        <p className="border-b border-line px-3 py-1 text-xs text-warn">
          {cueNotice}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <LayoutBranch
          node={tree}
          labelFor={(panel) =>
            panel === "browser" ? browserLabel : panelLabel(panel)
          }
          onActivate={activatePanel}
          onClose={(panel) => setTree((current) => closePanel(current, panel))}
          onPlace={placePanel}
          onResize={(id, ratio) =>
            setTree((current) => setRatio(current, id, ratio))
          }
          content={paneContent}
        />
        {ready
          ? createPortal(
              <TerminalPanel path={path} revision={revision} />,
              container,
            )
          : null}
        {open.browser && browserHost.ready
          ? createPortal(
              <BrowserPanel active={browserActive} />,
              browserHost.container,
            )
          : null}
      </div>
      {quickOpen ? (
        <QuickOpen
          path={path}
          focusTick={quickOpenTick}
          indexed={fileIndex.files}
          ready={fileIndex.ready}
          truncated={fileIndex.truncated}
          indexError={fileIndex.error}
          onOpen={(file) => {
            useCommandUi.getState().hideQuickOpen();
            editWorkFile(file);
          }}
          onClose={() => useCommandUi.getState().hideQuickOpen()}
        />
      ) : null}
    </div>
  );
}

function LayoutBranch({
  node,
  labelFor,
  onActivate,
  onClose,
  onPlace,
  onResize,
  content,
}: {
  node: LayoutNode;
  labelFor: (panel: PanelId) => string;
  onActivate: (panel: PanelId) => void;
  onClose: (panel: PanelId) => void;
  onPlace: (panel: PanelId, targetId: string, zone: DropZone) => void;
  onResize: (id: string, ratio: number) => void;
  content: (panel: PanelId) => ReactNode;
}) {
  if (node.kind === "pane") {
    return (
      <section
        data-pane-id={node.id}
        className="flex h-full min-h-0 min-w-0 flex-col bg-surface"
      >
        <PaneTabs
          paneId={node.id}
          tabs={node.tabs}
          active={node.active}
          labelFor={labelFor}
          iconFor={PANEL_ICON}
          closable={canClose}
          onActivate={onActivate}
          onClose={onClose}
          onPlace={onPlace}
        />
        <PaneBody
          active={node.active}
          tabs={node.tabs}
          keepMounted={staysMounted}
        >
          {content}
        </PaneBody>
      </section>
    );
  }

  const vertical = node.axis === "y";
  return (
    <PanelGroup
      key={`${node.id}:${node.axis}`}
      direction={vertical ? "vertical" : "horizontal"}
      className="h-full"
      onLayout={(sizes) => {
        onResize(node.id, (sizes[0] ?? 50) / 100);
      }}
    >
      <Panel
        defaultSize={node.ratio * 100}
        minSize={8}
        className="min-h-0 min-w-0"
      >
        <LayoutBranch
          node={node.first}
          labelFor={labelFor}
          onActivate={onActivate}
          onClose={onClose}
          onPlace={onPlace}
          onResize={onResize}
          content={content}
        />
      </Panel>
      <PanelResizeHandle
        className={vertical ? "h-px bg-line" : "w-px bg-line"}
      />
      <Panel
        defaultSize={(1 - node.ratio) * 100}
        minSize={8}
        className="min-h-0 min-w-0"
      >
        <LayoutBranch
          node={node.second}
          labelFor={labelFor}
          onActivate={onActivate}
          onClose={onClose}
          onPlace={onPlace}
          onResize={onResize}
          content={content}
        />
      </Panel>
    </PanelGroup>
  );
}

function canClose(panel: PanelId): boolean {
  return (
    panel === "history" ||
    panel === "editor" ||
    panel === "browser" ||
    panel === "terminal" ||
    panel === "scripts"
  );
}

function staysMounted(panel: PanelId): boolean {
  return panel === "browser" || panel === "terminal";
}

function useKeptHost() {
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = "h-full w-full min-h-0 min-w-0 overflow-hidden";
    return element;
  });
  const [ready, setReady] = useState(false);
  const assign = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return;
      }
      if (container.parentElement !== node) {
        node.appendChild(container);
      }
      setReady(true);
    },
    [container],
  );
  return { container, ready, assign };
}
