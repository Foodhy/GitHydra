export function subjectOf(message: string): string {
  const line = message.split("\n").find((row) => row.trim().length > 0);
  return line?.trim() || "(sin mensaje)";
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
