const VIEW_TABS = ["history", "editor", "browser"] as const;

export type DockedView = (typeof VIEW_TABS)[number];

export const VIEW_SIDES = ["right", "left", "top", "bottom"] as const;

export type ViewSide = (typeof VIEW_SIDES)[number];

export interface PlacedView {
  view: DockedView;
  side: ViewSide;
}

export interface OpenViews {
  open: Record<DockedView, boolean>;
  active: DockedView;
}

export const VIEW_DOCK_KEY = "githydra.viewDock";

export const viewSideLabel: Record<ViewSide, string> = {
  right: "A la derecha",
  left: "A la izquierda",
  top: "Arriba",
  bottom: "Abajo",
};

export interface DockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function placeView(view: DockedView, side: ViewSide): PlacedView {
  return { view, side };
}

export function movePlaced(
  placed: PlacedView | null,
  side: ViewSide,
): PlacedView | null {
  if (!placed) {
    return null;
  }
  return { view: placed.view, side };
}

export function releasePlaced(
  placed: PlacedView | null,
  view?: DockedView,
): PlacedView | null {
  if (!placed) {
    return null;
  }
  if (view && placed.view !== view) {
    return placed;
  }
  return null;
}

export function centerTab(
  layout: OpenViews,
  placed: PlacedView | null,
): DockedView | null {
  const away = placed && layout.open[placed.view] ? placed.view : null;
  if (layout.open[layout.active] && layout.active !== away) {
    return layout.active;
  }
  return VIEW_TABS.find((view) => layout.open[view] && view !== away) ?? null;
}

export function parsePlacedView(
  value: string | null | undefined,
): PlacedView | null {
  if (!value) {
    return null;
  }
  const [view, side] = value.split(":");
  if (!isView(view) || !isSide(side)) {
    return null;
  }
  return { view, side };
}

export function readPlacedView(storage: DockStorage): PlacedView | null {
  return parsePlacedView(storage.getItem(VIEW_DOCK_KEY));
}

export function writePlacedView(
  storage: DockStorage,
  placed: PlacedView | null,
): void {
  storage.setItem(VIEW_DOCK_KEY, placed ? `${placed.view}:${placed.side}` : "");
}

function isView(value: string | undefined): value is DockedView {
  return VIEW_TABS.some((view) => view === value);
}

function isSide(value: string | undefined): value is ViewSide {
  return VIEW_SIDES.some((side) => side === value);
}
