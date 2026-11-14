import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BranchPanel } from "../branches/BranchPanel";
import { CommitDiffPanel } from "../diff/CommitDiffPanel";
import { EditorPanel } from "../editor/EditorPanel";
import { HistoryPanel } from "../history/HistoryPanel";
import { StagingPanel } from "../staging/StagingPanel";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TopBar } from "./TopBar";

type CenterTab = "history" | "editor";

export function WorkspaceShell({ path }: { path: string }) {
  const [tab, setTab] = useState<CenterTab>("history");
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [trackedPath, setTrackedPath] = useState(path);
  if (trackedPath !== path) {
    setTrackedPath(path);
    setSelectedSha(null);
  }

  function toggleCommit(sha: string) {
    setSelectedSha((current) => (current === sha ? null : sha));
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="min-h-0 flex-1">
        <PanelGroup autoSaveId="githydra-rows" direction="vertical">
          <Panel defaultSize={78} minSize={40}>
            <PanelGroup autoSaveId="githydra-cols" direction="horizontal">
              <Panel defaultSize={20} minSize={14} className="min-w-0">
                <BranchPanel path={path} />
              </Panel>
              <PanelResizeHandle className="w-px bg-line" />
              <Panel defaultSize={52} minSize={30} className="min-w-0">
                <section className="flex h-full min-w-0 flex-col">
                  <div className="flex gap-1 border-b border-line px-2 py-1">
                    <TabButton
                      active={tab === "history"}
                      onClick={() => setTab("history")}
                    >
                      Historial
                    </TabButton>
                    <TabButton
                      active={tab === "editor"}
                      onClick={() => setTab("editor")}
                    >
                      Editor
                    </TabButton>
                  </div>
                  <div className="min-h-0 flex-1">
                    {tab === "history" ? (
                      <HistoryPanel
                        path={path}
                        selectedSha={selectedSha}
                        onSelect={toggleCommit}
                      />
                    ) : (
                      <EditorPanel />
                    )}
                  </div>
                </section>
              </Panel>
              <PanelResizeHandle className="w-px bg-line" />
              <Panel defaultSize={28} minSize={18} className="min-w-0">
                {selectedSha ? (
                  <CommitDiffPanel
                    path={path}
                    sha={selectedSha}
                    onClear={() => setSelectedSha(null)}
                  />
                ) : (
                  <StagingPanel path={path} />
                )}
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="h-px bg-line" />
          <Panel defaultSize={22} minSize={10} className="min-h-0">
            <TerminalPanel />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-surface-overlay text-text" : "text-muted"}`}
    >
      {children}
    </button>
  );
}
