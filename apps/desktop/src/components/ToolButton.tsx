import { Loader2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

export function ToolButton({
  label,
  children,
  onClick,
  disabled = false,
  busy = false,
  pressed = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  busy?: boolean;
  pressed?: boolean;
}) {
  const inactive = !onClick;
  const quiet = inactive || disabled;
  return (
    <button
      type="button"
      title={inactive ? `${label} · próxima fase` : busy ? `${label}…` : label}
      disabled={quiet}
      aria-pressed={onClick ? pressed : undefined}
      onClick={onClick}
      className={`rounded-md p-1.5 ${
        quiet
          ? "text-muted"
          : pressed
            ? "bg-surface-overlay text-text"
            : "text-text hover:bg-surface-overlay"
      }`}
    >
      <span className="sr-only">{label}</span>
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}
