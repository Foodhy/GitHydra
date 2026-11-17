export interface MoveRow {
  path: string;
  kind: "file" | "dir";
}

export function parentDirectory(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

/** Carpeta donde caería el elemento, o null si el soltado no lo mueve. */
export function moveTarget(source: string, row: MoveRow | null): string | null {
  if (source.length === 0 || source.includes("\0") || source.includes("\\")) {
    return null;
  }
  const directory =
    row === null
      ? ""
      : row.kind === "dir"
        ? row.path
        : parentDirectory(row.path);
  if (directory === parentDirectory(source)) {
    return null;
  }
  if (directory === source || directory.startsWith(`${source}/`)) {
    return null;
  }
  return directory;
}

export function retargetPath(path: string, from: string, to: string): string {
  if (path === from) {
    return to;
  }
  const prefix = `${from}/`;
  if (path.startsWith(prefix)) {
    return `${to}/${path.slice(prefix.length)}`;
  }
  return path;
}

export function retargetOpen(
  open: Record<string, boolean>,
  from: string,
  to: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(open)) {
    next[key.length === 0 ? "" : retargetPath(key, from, to)] = value;
  }
  return next;
}
