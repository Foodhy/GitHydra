import type { ReactNode } from "react";

export function ToolButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const inactive = !onClick;
  return (
    <button
      type="button"
      title={inactive ? `${label} · próxima fase` : label}
      disabled={inactive || disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 ${
        inactive || disabled
          ? "text-muted"
          : "text-text hover:bg-surface-overlay"
      }`}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}
