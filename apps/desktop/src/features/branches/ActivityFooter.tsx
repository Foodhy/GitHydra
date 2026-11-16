import mark from "../../../src-tauri/icons/icon.png";
import { useAppVersion } from "../../hooks/useAppVersion";
import { canCancel, cancelOperation } from "../../lib/run-operation";
import { useOperation } from "../../stores/operation";
import { useRepoSession } from "../../stores/repo-session";

export function ActivityFooter() {
  const version = useAppVersion();
  const info = useRepoSession((state) => state.info);
  const running = useOperation((state) => state.running);
  const kind = useOperation((state) => state.kind);
  const label = useOperation((state) => state.label);
  const detail = useOperation((state) => state.detail);
  const notice = useOperation((state) => state.notice);
  const busy = kind !== null && label.length > 0;
  const branch = info?.isDetached
    ? "HEAD suelto"
    : (info?.currentBranch ?? "sin rama");

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-2">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center">
        {busy ? <span className="activity-ring absolute inset-0" /> : null}
        <img
          src={mark}
          alt=""
          className={`h-7 w-7 ${busy ? "activity-mark" : ""}`}
        />
      </span>
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        {busy ? (
          <>
            <p className="truncate text-xs">{label}</p>
            {detail ? (
              <p className="truncate text-[11px] text-muted">{detail}</p>
            ) : null}
            {running && canCancel(kind) ? (
              <button
                type="button"
                onClick={() => {
                  void cancelOperation();
                }}
                className="text-[11px] text-accent"
              >
                Cancelar
              </button>
            ) : null}
          </>
        ) : notice ? (
          <p
            className={`truncate text-xs ${notice === "Cancelado" ? "text-muted" : "text-warn"}`}
          >
            {notice}
          </p>
        ) : (
          <div className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-muted">
              v{version}
            </span>
            <span className="truncate rounded bg-accent-dim px-1.5 py-0.5 text-[10px] text-accent">
              {branch}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
