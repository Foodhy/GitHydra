const BRANCH_COLORS = [
  "#5b8cff",
  "#b388ff",
  "#e2b15a",
  "#e06b8a",
  "#3ee0b0",
  "#f0a05a",
  "#7ec8e3",
  "#d4e157",
  "#ce93d8",
  "#80cbc4",
  "#ff8a65",
  "#90caf9",
];

export function branchColor(name: string, isHead: boolean): string {
  if (isHead) {
    return "var(--color-accent)";
  }
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return BRANCH_COLORS[hash % BRANCH_COLORS.length] ?? BRANCH_COLORS[0];
}

export function laneColor(column: number): string {
  if (column === 0) {
    return "var(--color-graph-edge)";
  }
  return BRANCH_COLORS[column % BRANCH_COLORS.length] ?? BRANCH_COLORS[0];
}

export function tipColor(
  tips: { name: string; remote: string | null; isHead: boolean }[],
): string | null {
  if (tips.length === 0) {
    return null;
  }
  const local = tips.find((branch) => branch.remote === null && !branch.isHead);
  const head = tips.find((branch) => branch.isHead);
  const chosen = local ?? head ?? tips[0];
  if (!chosen) {
    return null;
  }
  return branchColor(chosen.name, chosen.isHead);
}
