import type { WorkingTreeKind } from "@githydra/contracts";

export interface RowMark {
  label: string;
  tone: "new" | "changed";
}

export function fileMark(kind: WorkingTreeKind): RowMark {
  switch (kind) {
    case "untracked":
    case "added":
      return { label: "U", tone: "new" };
    case "deleted":
      return { label: "D", tone: "changed" };
    case "renamed":
      return { label: "R", tone: "changed" };
    case "conflicted":
      return { label: "C", tone: "changed" };
    default:
      return { label: "M", tone: "changed" };
  }
}

function rank(mark: RowMark): number {
  if (mark.label === "C") {
    return 0;
  }
  return mark.tone === "changed" ? 1 : 2;
}

function parentDirectory(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

export function buildStatusMarks(
  entries: readonly { path: string; kind: WorkingTreeKind }[],
): Map<string, RowMark> {
  const marks = new Map<string, RowMark>();
  const dirs = new Map<string, "new" | "changed">();
  for (const entry of entries) {
    const mark = fileMark(entry.kind);
    const previous = marks.get(entry.path);
    if (!previous || rank(mark) < rank(previous)) {
      marks.set(entry.path, mark);
    }
    let directory = parentDirectory(entry.path);
    while (directory) {
      const tone =
        mark.tone === "changed" || dirs.get(directory) === "changed"
          ? "changed"
          : "new";
      dirs.set(directory, tone);
      directory = parentDirectory(directory);
    }
  }
  for (const [directory, tone] of dirs) {
    if (!marks.has(directory)) {
      marks.set(directory, { label: "·", tone });
    }
  }
  return marks;
}
