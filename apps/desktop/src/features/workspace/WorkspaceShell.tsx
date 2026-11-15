import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { tauriGit } from "../../lib/git/tauri-git-adapter";
import { useRepoSession } from "../../stores/repo-session";
import { BranchPanel } from "../branches/BranchPanel";
import { CommitDiffPanel } from "../diff/CommitDiffPanel";
import { WorkDiffPanel, type WorkFile } from "../diff/WorkDiffPanel";
import { EditorPanel } from "../editor/EditorPanel";
import { HistoryPanel } from "../history/HistoryPanel";
import { StagingPanel } from "../staging/StagingPanel";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TopBar } from "./TopBar";

type CenterTab = "history" | "editor";

export function WorkspaceShell({ path }: { path: string }) {
  const setInfo = useRepoSession((state) => state.setInfo);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<CenterTab>("history");
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [workFile, setWorkFile] = useState<WorkFile | null>(null);
  const [trackedPath, setTrackedPath] = useState(path);
  if (trackedPath !== path) {
    setTrackedPath(path);
    setSelectedSha(null);
    setEditorFile(null);
    setWorkFile(null);
  }

  async function refreshRepository() {
    const repo = await tauriGit.openRepository(path);
    setInfo(repo);
    setRevision((current) => current + 1);
  }

  function toggleCommit(sha: string) {
    setWorkFile(null);
    setSelectedSha((current) => (current === sha ? null : sha));
  }

  function selectWorkFile(file: WorkFile) {
    setSelectedSha(null);
    setWorkFile(file);
    setTab("history");
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar path={path} onRepositoryChanged={refreshRepository} />
      <div className="min-h-0 flex-1">
        <PanelGroup autoSaveId="githydra-rows" direction="vertical">
          <Panel defaultSize={78} minSize={40}>
            <PanelGroup autoSaveId="githydra-cols-v2" direction="horizontal">
              <Panel defaultSize={16} minSize={12} className="min-w-0">
                <BranchPanel
                  path={path}
                  revision={revision}
                  onRepositoryChanged={refreshRepository}
                />
              </Panel>
              <PanelResizeHandle className="w-px bg-line" />
              <Panel defaultSize={48} minSize={28} className="min-w-0">
                <section className="flex h-full min-w-0 flex-col">
                  <div className="flex gap-1 border-b border-line px-2 py-1">
                    <TabButton
                      active={tab === "history" && !workFile}
                      onClick={() => {
                        setWorkFile(null);
                        setTab("history");
                      }}
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
                    {tab === "history" && workFile ? (
                      <WorkDiffPanel
                        path={path}
                        file={workFile}
                        onSelect={selectWorkFile}
                      />
                    ) : tab === "history" ? (
                      <HistoryPanel
                        path={path}
                        revision={revision}
                        selectedSha={selectedSha}
                        onSelect={toggleCommit}
                        onRepositoryChanged={refreshRepository}
                      />
                    ) : (
                      <EditorPanel
                        path={path}
                        sha={selectedSha}
                        file={editorFile}
                      />
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
                    onSelectFile={setEditorFile}
                  />
                ) : (
                  <StagingPanel
                    path={path}
                    revision={revision}
                    selected={workFile}
                    onSelect={selectWorkFile}
                    onRepositoryChanged={refreshRepository}
                  />
                )}
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="h-px bg-line" />
          <Panel defaultSize={22} minSize={10} className="min-h-0">
            <TerminalPanel path={path} />
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
