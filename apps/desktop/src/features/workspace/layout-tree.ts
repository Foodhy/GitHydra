import { type MessageKey, t } from "../../lib/i18n.ts";
import type { TerminalDock } from "../terminal/dock.ts";
import type { CenterView } from "./center-views.ts";
import type { PlacedView } from "./view-dock.ts";

export const PANELS = [
  "branches",
  "history",
  "editor",
  "browser",
  "changes",
  "terminal",
  "scripts",
] as const;

export type PanelId = (typeof PANELS)[number];

export const EDGE_ZONES = ["right", "left", "top", "bottom"] as const;

export const DROP_ZONES = ["left", "right", "top", "bottom", "center"] as const;

export type DropZone = (typeof DROP_ZONES)[number];

export type EdgeZone = Exclude<DropZone, "center">;

export interface PaneNode {
  kind: "pane";
  id: string;
  tabs: PanelId[];
  active: PanelId;
}

export interface SplitNode {
  kind: "split";
  id: string;
  axis: "x" | "y";
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = PaneNode | SplitNode;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function zoneLabel(zone: EdgeZone): string {
  return t(`zone.${zone}` as MessageKey);
}

export function panelLabel(id: PanelId): string {
  return t(`panel.${id}` as MessageKey);
}

const PERMANENT: PanelId[] = ["branches", "changes"];
const CENTER: CenterView[] = ["history", "editor", "browser"];

export function nextLayoutId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `n${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function defaultLayout(): LayoutNode {
  return migrateLayout("bottom", null);
}

export function migrateLayout(
  dock: TerminalDock,
  placed: PlacedView | null,
): LayoutNode {
  const tabs = CENTER.filter((view) => view !== placed?.view);
  const inner = shellFor(dock, tabs);
  if (!placed) {
    return inner;
  }
  const leaf = pane("placed", [placed.view]);
  if (placed.side === "top") {
    return split("placed-split", "y", 0.32, leaf, inner);
  }
  if (placed.side === "bottom") {
    return split("placed-split", "y", 0.68, inner, leaf);
  }
  if (placed.side === "left") {
    return split("placed-split", "x", 0.32, leaf, inner);
  }
  return split("placed-split", "x", 0.68, inner, leaf);
}

export function findPane(tree: LayoutNode, panel: PanelId): PaneNode | null {
  if (tree.kind === "pane") {
    return tree.tabs.includes(panel) ? tree : null;
  }
  return findPane(tree.first, panel) ?? findPane(tree.second, panel);
}

export function placementOf(
  tree: LayoutNode,
  panel: PanelId,
): { axis: "x" | "y"; side: "first" | "second" } | null {
  const leaf = findPane(tree, panel);
  if (!leaf) {
    return null;
  }
  const parent = findParent(tree, leaf.id);
  if (!parent) {
    return null;
  }
  return {
    axis: parent.axis,
    side: parent.first.id === leaf.id ? "first" : "second",
  };
}

export function centerOpen(tree: LayoutNode): Record<CenterView, boolean> {
  return {
    history: findPane(tree, "history") !== null,
    editor: findPane(tree, "editor") !== null,
    browser: findPane(tree, "browser") !== null,
  };
}

export function activate(tree: LayoutNode, panel: PanelId): LayoutNode {
  const leaf = findPane(tree, panel);
  if (!leaf || leaf.active === panel) {
    return tree;
  }
  return mapPane(tree, leaf.id, (pane) => ({ ...pane, active: panel }));
}

export function openPanel(tree: LayoutNode, panel: PanelId): LayoutNode {
  if (findPane(tree, panel)) {
    return activate(tree, panel);
  }
  const host = isCenter(panel) ? restoreScreens(tree) : tree;
  if (findPane(host, panel)) {
    return activate(host, panel);
  }
  return addTab(host, mainPane(host).id, panel);
}

/** Puts history, editor, and browser back when every one of them is closed. */
export function restoreScreens(
  tree: LayoutNode,
  ids: () => string = nextLayoutId,
): LayoutNode {
  if (CENTER.some((view) => findPane(tree, view))) {
    return tree;
  }
  const center = pane(ids(), ["history", "editor", "browser"], "history");
  const branches = findPane(tree, "branches");
  const changes = findPane(tree, "changes");
  if (branches && changes) {
    const parent = findParent(tree, changes.id);
    if (
      parent &&
      (parent.first.id === branches.id || parent.second.id === branches.id)
    ) {
      const branchesFirst = parent.first.id === branches.id;
      const beside = split(ids(), "x", 0.62, center, changes);
      return replace(tree, parent.id, {
        ...parent,
        first: branchesFirst ? branches : beside,
        second: branchesFirst ? beside : branches,
      });
    }
  }
  return split(ids(), "x", 0.72, center, tree);
}

export function closePanel(tree: LayoutNode, panel: PanelId): LayoutNode {
  if (!isCenter(panel) && panel !== "terminal" && panel !== "scripts") {
    return tree;
  }
  return extract(tree, panel) ?? tree;
}

export function restoreTerminal(
  tree: LayoutNode,
  ids: () => string = nextLayoutId,
): LayoutNode {
  if (findPane(tree, "terminal")) {
    return activate(tree, "terminal");
  }
  return split(ids(), "y", 0.78, tree, pane(ids(), ["terminal"]));
}

export function place(
  tree: LayoutNode,
  panel: PanelId,
  targetId: string,
  zone: DropZone,
  ids: () => string = nextLayoutId,
): LayoutNode {
  const source = findPane(tree, panel);
  const target = findById(tree, targetId);
  if (!source || !target || target.kind !== "pane") {
    return tree;
  }
  if (source.id === target.id && zone === "center") {
    return tree;
  }
  if (
    source.id === target.id &&
    source.tabs.length === 1 &&
    zone !== "center"
  ) {
    return moveLeaf(tree, source.id, zone);
  }
  if (source.id === target.id && zone !== "center") {
    return splitOff(tree, source, panel, zone, ids, true);
  }
  const extracted = extract(tree, panel);
  if (!extracted) {
    return tree;
  }
  const live = findById(extracted, targetId);
  if (live?.kind !== "pane") {
    return openPanel(extracted, panel);
  }
  if (zone === "center") {
    return addTab(extracted, targetId, panel);
  }
  return splitOff(extracted, live, panel, zone, ids, false);
}

export function setRatio(
  tree: LayoutNode,
  id: string,
  ratio: number,
): LayoutNode {
  if (tree.kind === "pane") {
    return tree;
  }
  if (tree.id === id) {
    const rounded = Math.round(clamp(ratio, 0.08, 0.92) * 1000) / 1000;
    if (Math.abs(tree.ratio - rounded) < 0.005) {
      return tree;
    }
    return { ...tree, ratio: rounded };
  }
  const first = setRatio(tree.first, id, ratio);
  const second = setRatio(tree.second, id, ratio);
  if (first === tree.first && second === tree.second) {
    return tree;
  }
  return { ...tree, first, second };
}

export function zoneAt(rect: Box, x: number, y: number): DropZone {
  if (rect.width <= 0 || rect.height <= 0) {
    return "center";
  }
  const px = (x - rect.left) / rect.width;
  const py = (y - rect.top) / rect.height;
  const edge = 0.22;
  const distances: [EdgeZone, number][] = [
    ["left", px],
    ["right", 1 - px],
    ["top", py],
    ["bottom", 1 - py],
  ];
  let best: DropZone = "center";
  let bestDist = edge;
  for (const [zone, dist] of distances) {
    if (dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

export function zoneRect(rect: Box, zone: DropZone): Box {
  if (zone === "left") {
    return { ...rect, width: rect.width / 2 };
  }
  if (zone === "right") {
    return {
      left: rect.left + rect.width / 2,
      top: rect.top,
      width: rect.width / 2,
      height: rect.height,
    };
  }
  if (zone === "top") {
    return { ...rect, height: rect.height / 2 };
  }
  if (zone === "bottom") {
    return {
      left: rect.left,
      top: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height / 2,
    };
  }
  const insetX = rect.width * 0.18;
  const insetY = rect.height * 0.18;
  return {
    left: rect.left + insetX,
    top: rect.top + insetY,
    width: rect.width - insetX * 2,
    height: rect.height - insetY * 2,
  };
}

export function parseLayout(
  value: string | null | undefined,
): LayoutNode | null {
  if (!value) {
    return null;
  }
  try {
    return parseLayoutNode(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseLayoutNode(value: unknown): LayoutNode | null {
  const node = parseNode(value, new Set(), new Set(), 0);
  if (!node) {
    return null;
  }
  const present = new Set(collectPanels(node));
  if (!PERMANENT.every((panel) => present.has(panel))) {
    return null;
  }
  return node;
}

export function cloneLayout(tree: LayoutNode): LayoutNode {
  return parseLayoutNode(JSON.parse(JSON.stringify(tree))) ?? tree;
}

function shellFor(dock: TerminalDock, tabs: PanelId[]): LayoutNode {
  const active = tabs.includes("history") ? "history" : tabs[0];
  if (dock === "center") {
    return split(
      "root",
      "y",
      0.78,
      split(
        "cols",
        "x",
        0.18,
        pane("branches", ["branches"]),
        split(
          "mid",
          "x",
          0.51,
          pane("terminal", ["terminal"]),
          pane("changes", ["changes"]),
        ),
      ),
      pane("center", tabs, active),
    );
  }
  const columns = split(
    "cols",
    "x",
    0.18,
    pane("branches", ["branches"]),
    split(
      "mid",
      "x",
      0.51,
      pane("center", tabs, active),
      pane("changes", ["changes"]),
    ),
  );
  if (dock === "top") {
    return split("root", "y", 0.22, pane("terminal", ["terminal"]), columns);
  }
  if (dock === "left") {
    return split("root", "x", 0.22, pane("terminal", ["terminal"]), columns);
  }
  if (dock === "right") {
    return split("root", "x", 0.78, columns, pane("terminal", ["terminal"]));
  }
  return split("root", "y", 0.78, columns, pane("terminal", ["terminal"]));
}

function pane(id: string, tabs: PanelId[], active?: PanelId): PaneNode {
  return { kind: "pane", id, tabs, active: active ?? tabs[0] };
}

function split(
  id: string,
  axis: "x" | "y",
  ratio: number,
  first: LayoutNode,
  second: LayoutNode,
): SplitNode {
  return { kind: "split", id, axis, ratio, first, second };
}

function isCenter(panel: PanelId): panel is CenterView {
  return panel === "history" || panel === "editor" || panel === "browser";
}

function isPanel(value: string): value is PanelId {
  return PANELS.some((panel) => panel === value);
}

function findById(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) {
    return node;
  }
  if (node.kind === "pane") {
    return null;
  }
  return findById(node.first, id) ?? findById(node.second, id);
}

function findParent(node: LayoutNode, id: string): SplitNode | null {
  if (node.kind === "pane") {
    return null;
  }
  if (node.first.id === id || node.second.id === id) {
    return node;
  }
  return findParent(node.first, id) ?? findParent(node.second, id);
}

function listPanes(node: LayoutNode, into: PaneNode[] = []): PaneNode[] {
  if (node.kind === "pane") {
    into.push(node);
    return into;
  }
  listPanes(node.first, into);
  listPanes(node.second, into);
  return into;
}

function mainPane(tree: LayoutNode): PaneNode {
  const panes = listPanes(tree);
  let best = panes[0];
  let bestCount = -1;
  for (const leaf of panes) {
    const count = leaf.tabs.filter((tab) => isCenter(tab)).length;
    if (count > bestCount) {
      best = leaf;
      bestCount = count;
    }
  }
  return best;
}

function addTab(tree: LayoutNode, paneId: string, panel: PanelId): LayoutNode {
  return mapPane(tree, paneId, (leaf) => {
    if (leaf.tabs.includes(panel)) {
      return { ...leaf, active: panel };
    }
    return { ...leaf, tabs: [...leaf.tabs, panel], active: panel };
  });
}

function moveLeaf(
  tree: LayoutNode,
  paneId: string,
  zone: EdgeZone,
): LayoutNode {
  const parent = findParent(tree, paneId);
  if (!parent) {
    return tree;
  }
  const leafIsFirst = parent.first.id === paneId;
  const leaf = leafIsFirst ? parent.first : parent.second;
  const sibling = leafIsFirst ? parent.second : parent.first;
  const axis = zone === "left" || zone === "right" ? "x" : "y";
  const wantFirst = zone === "left" || zone === "top";
  if (parent.axis === axis) {
    if (leafIsFirst === wantFirst) {
      return tree;
    }
    return replace(tree, parent.id, {
      ...parent,
      ratio: Math.round((1 - parent.ratio) * 1000) / 1000,
      first: leaf,
      second: sibling,
    });
  }
  return replace(tree, parent.id, {
    ...parent,
    axis,
    ratio: 0.5,
    first: wantFirst ? leaf : sibling,
    second: wantFirst ? sibling : leaf,
  });
}

function splitOff(
  tree: LayoutNode,
  target: PaneNode,
  panel: PanelId,
  zone: EdgeZone,
  ids: () => string,
  removeFromTarget: boolean,
): LayoutNode {
  const remaining = target.tabs.filter((tab) => tab !== panel);
  const siblings = removeFromTarget
    ? {
        ...target,
        tabs: remaining,
        active:
          target.active === panel ? (remaining[0] ?? panel) : target.active,
      }
    : target;
  const leaf = pane(ids(), [panel]);
  const axis = zone === "left" || zone === "right" ? "x" : "y";
  const panelFirst = zone === "left" || zone === "top";
  const next = split(
    ids(),
    axis,
    0.5,
    panelFirst ? leaf : siblings,
    panelFirst ? siblings : leaf,
  );
  return replace(tree, target.id, next);
}

function extract(node: LayoutNode, panel: PanelId): LayoutNode | null {
  if (node.kind === "pane") {
    if (!node.tabs.includes(panel)) {
      return node;
    }
    const tabs = node.tabs.filter((tab) => tab !== panel);
    if (tabs.length === 0) {
      return null;
    }
    return {
      ...node,
      tabs,
      active: node.active === panel ? tabs[0] : node.active,
    };
  }
  const first = extract(node.first, panel);
  const second = extract(node.second, panel);
  if (first === node.first && second === node.second) {
    return node;
  }
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return { ...node, first, second };
}

function replace(node: LayoutNode, id: string, next: LayoutNode): LayoutNode {
  if (node.id === id) {
    return next;
  }
  if (node.kind === "pane") {
    return node;
  }
  const first = replace(node.first, id, next);
  const second = replace(node.second, id, next);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

function mapPane(
  node: LayoutNode,
  id: string,
  update: (pane: PaneNode) => PaneNode,
): LayoutNode {
  if (node.kind === "pane") {
    return node.id === id ? update(node) : node;
  }
  const first = mapPane(node.first, id, update);
  const second = mapPane(node.second, id, update);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

function collectPanels(node: LayoutNode): PanelId[] {
  if (node.kind === "pane") {
    return node.tabs;
  }
  return [...collectPanels(node.first), ...collectPanels(node.second)];
}

function parseNode(
  value: unknown,
  seenIds: Set<string>,
  seenPanels: Set<string>,
  depth: number,
): LayoutNode | null {
  if (depth > 24 || !value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.id.length > 80 ||
    seenIds.has(record.id)
  ) {
    return null;
  }
  seenIds.add(record.id);
  if (record.kind === "pane") {
    if (!Array.isArray(record.tabs) || record.tabs.length === 0) {
      return null;
    }
    const tabs: PanelId[] = [];
    for (const tab of record.tabs) {
      if (typeof tab !== "string" || !isPanel(tab) || seenPanels.has(tab)) {
        return null;
      }
      seenPanels.add(tab);
      tabs.push(tab);
    }
    if (
      typeof record.active !== "string" ||
      !tabs.includes(record.active as PanelId)
    ) {
      return null;
    }
    return {
      kind: "pane",
      id: record.id,
      tabs,
      active: record.active as PanelId,
    };
  }
  if (record.kind !== "split") {
    return null;
  }
  if (record.axis !== "x" && record.axis !== "y") {
    return null;
  }
  if (
    typeof record.ratio !== "number" ||
    !Number.isFinite(record.ratio) ||
    record.ratio <= 0 ||
    record.ratio >= 1
  ) {
    return null;
  }
  const first = parseNode(record.first, seenIds, seenPanels, depth + 1);
  const second = parseNode(record.second, seenIds, seenPanels, depth + 1);
  if (!first || !second) {
    return null;
  }
  return {
    kind: "split",
    id: record.id,
    axis: record.axis,
    ratio: record.ratio,
    first,
    second,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
