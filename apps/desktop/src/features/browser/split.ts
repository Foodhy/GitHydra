export type BrowserSplit = "side" | "stack";

export function pageForPane(
  panes: readonly string[],
  pages: readonly { id: string }[],
  chosenId: string,
): string | null {
  if (pages.some((page) => page.id === chosenId) && !panes.includes(chosenId)) {
    return chosenId;
  }
  return pages.find((page) => !panes.includes(page.id))?.id ?? null;
}

export function includePane(panes: readonly string[], id: string): string[] {
  if (panes.includes(id)) {
    return [...panes];
  }
  return [...panes, id];
}

export function mosaicGrid(
  count: number,
  flow: BrowserSplit,
): { columns: string; rows: string } {
  const track = "minmax(0, 1fr)";
  if (count <= 1) {
    return { columns: track, rows: track };
  }
  if (flow === "stack" && count === 2) {
    return { columns: track, rows: `${track} ${track}` };
  }
  const rowCount = Math.ceil(count / 2);
  return {
    columns: `${track} ${track}`,
    rows: Array.from({ length: rowCount }, () => track).join(" "),
  };
}
