export const CENTER_VIEWS = ["history", "editor", "browser"] as const;

export type CenterView = (typeof CENTER_VIEWS)[number];

export interface CenterLayout {
  open: Record<CenterView, boolean>;
  active: CenterView;
}

export function initialCenterLayout(): CenterLayout {
  return {
    open: { history: true, editor: true, browser: true },
    active: "history",
  };
}

export function openCenterView(
  layout: CenterLayout,
  view: CenterView,
): CenterLayout {
  return {
    open: { ...layout.open, [view]: true },
    active: view,
  };
}

export function closeCenterView(
  layout: CenterLayout,
  view: CenterView,
): CenterLayout {
  if (!layout.open[view]) {
    return layout;
  }
  const open = { ...layout.open, [view]: false };
  if (layout.active !== view) {
    return { open, active: layout.active };
  }
  const next = CENTER_VIEWS.find((item) => open[item]);
  return { open, active: next ?? view };
}

type ShowCenterView = (view: CenterView) => void;

let show: ShowCenterView | null = null;

export function bindCenterViews(next: ShowCenterView): () => void {
  show = next;
  return () => {
    if (show === next) {
      show = null;
    }
  };
}

export function showCenterView(view: CenterView): void {
  show?.(view);
}
