import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect } from "react";
import { installFileMenu, syncFileMenu } from "../../lib/file-menu";
import {
  bindRepoNavigation,
  closeRepoTab,
  focusRepoTab,
  openNewTab,
} from "../../lib/repo-actions";
import { useGitProgress } from "../../lib/run-operation";
import { useCommandUi } from "../../stores/command-ui";
import { useRepoTabs } from "../../stores/repo-tabs";
import { CloneDialog } from "./CloneDialog";

export function AppChrome() {
  const navigate = useNavigate();
  const tabs = useRepoTabs((state) => state.tabs);
  const activeId = useRepoTabs((state) => state.activeId);
  const closed = useRepoTabs((state) => state.closed);
  const notice = useCommandUi((state) => state.notice);
  const setNotice = useCommandUi((state) => state.setNotice);
  useGitProgress();

  useEffect(() => {
    return bindRepoNavigation((path) => {
      if (path) {
        void navigate({
          to: "/repo/$",
          params: { _splat: path.replace(/^\/+/, "") },
        });
        return;
      }
      void navigate({ to: "/" });
    });
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    void installFileMenu()
      .then(() => {
        if (!alive) {
          return;
        }
        const state = useRepoTabs.getState();
        syncFileMenu({
          canReopen: state.closed.length > 0,
          hasRepo: state.activePath() !== null,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const active = tabs.find((tab) => tab.id === activeId);
    syncFileMenu({
      canReopen: closed.length > 0,
      hasRepo: Boolean(active?.path),
    });
  }, [tabs, activeId, closed.length]);

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-surface-raised px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`flex h-6 max-w-48 shrink-0 items-center rounded ${
                  active
                    ? "bg-surface-overlay text-text"
                    : "text-muted hover:bg-surface-overlay/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => focusRepoTab(tab.id)}
                  className="min-w-0 truncate px-2 text-xs"
                  title={tab.path ?? tab.name}
                >
                  {tab.name}
                </button>
                <button
                  type="button"
                  aria-label={`Cerrar ${tab.name}`}
                  onClick={() => closeRepoTab(tab.id)}
                  className="mr-1 rounded p-0.5 hover:bg-surface hover:text-text"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Nueva pestaña"
          title="Nueva pestaña"
          onClick={openNewTab}
          className="rounded px-2 text-sm text-muted hover:bg-surface-overlay hover:text-text"
        >
          +
        </button>
      </div>
      {notice ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-1">
          <p className="min-w-0 truncate text-xs text-warn">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs text-muted"
          >
            Cerrar
          </button>
        </div>
      ) : null}
      <CloneDialog />
    </>
  );
}
