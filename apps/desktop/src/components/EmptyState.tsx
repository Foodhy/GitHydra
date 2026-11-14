export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm text-text">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}
