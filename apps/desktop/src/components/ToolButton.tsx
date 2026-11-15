import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function ToolButton({
  label,
  children,
  onClick,
  disabled = false,
  busy = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = !onClick;
  return (
    <button
      type="button"
      title={inactive ? `${label} · próxima fase` : busy ? `${label}…` : label}
      disabled={inactive || disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 ${
        inactive || disabled
          ? "text-muted"
          : "text-text hover:bg-surface-overlay"
      }`}
    >
      <span className="sr-only">{label}</span>
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}
