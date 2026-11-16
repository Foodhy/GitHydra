import { invoke } from "@tauri-apps/api/core";
import {
  FileCode2,
  FileDiff,
  GitBranch,
  Globe,
  History,
  type LucideIcon,
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
import { useRepoSync } from "../../hooks/useRepoSync";
import { bindTerminalPanel, syncWindowPanels } from "../../lib/file-menu";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
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
import { HistoryPanel } from "../history/HistoryPanel";
import { StagingPanel } from "../staging/StagingPanel";
import { TerminalSlot, useTerminalHost } from "../terminal/TerminalChrome";
import { TerminalPanel } from "../terminal/TerminalPanel";
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
};

export function WorkspaceShell({ path }: { path: string }) {
  const setInfo = useRepoSession((state) => state.setInfo);
  const [revision, setRevision] = useState(0);
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

  async function refreshRepository() {
    const repo = await tauriGit.openRepository(path);
    setInfo(repo);
    setRevision((current) => current + 1);
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

  const open = centerOpen(tree);
  const terminalOpen = findPane(tree, "terminal") !== null;

  useEffect(() => {
    syncWindowPanels({
      enabled: true,
      open: {
        history: open.history,
        editor: open.editor,
        browser: open.browser,
      },
      terminal: terminalOpen,
    });
  }, [open.browser, open.editor, open.history, terminalOpen]);

  useEffect(() => {
    return () => {
      clearBrowserPage();
      void invoke("browser_close_all");
      syncWindowPanels({
        enabled: false,
        open: { history: false, editor: false, browser: false },
        terminal: false,
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
      <div className="min-h-0 flex-1">
        <LayoutBranch
          node={tree}
          labelFor={(panel) =>
            panel === "browser" ? browserLabel : panelLabel[panel]
          }
          onActivate={activatePanel}
          onClose={(panel) => setTree((current) => closePanel(current, panel))}
          onPlace={placePanel}
          onResize={(id, ratio) =>
            setTree((current) => setRatio(current, id, ratio))
          }
          content={paneContent}
        />
        {ready ? createPortal(<TerminalPanel path={path} />, container) : null}
        {open.browser && browserHost.ready
          ? createPortal(
              <BrowserPanel active={browserActive} />,
              browserHost.container,
            )
          : null}
      </div>
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
    panel === "terminal"
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
