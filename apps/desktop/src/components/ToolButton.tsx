import type { ReactNode } from "react";

export function ToolButton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${label} · próxima fase`}
      disabled
      className="rounded-md p-1.5 text-muted"
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}
