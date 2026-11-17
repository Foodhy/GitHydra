import {
  CheckMenuItem,
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import {
  CENTER_VIEWS,
  type CenterView,
  showCenterView,
} from "../features/workspace/center-views";
import { useCommandUi } from "../stores/command-ui";
import { type MessageKey, subscribeLocale, t } from "./i18n";
import {
  closeRepoTab,
  initChosenFolder,
  openActiveInEditor,
  openActiveInTerminal,
  openChosenFolder,
  openNewTab,
  reopenClosedTab,
  reportCommandError,
  revealActiveRepo,
  showRepoManagement,
} from "./repo-actions";
import {
  getUiScale,
  onUiScale,
  setUiScale,
  UI_SCALES,
  type UiScale,
} from "./ui-scale";

interface ToggleItems {
  reopen: MenuItem;
  editor: MenuItem;
  terminal: MenuItem;
  finder: MenuItem;
  quickOpen: MenuItem;
  terminalFill: MenuItem;
  restoreScreens: MenuItem;
}

let toggles: ToggleItems | null = null;
let panels:
  | (Record<CenterView, CheckMenuItem> & {
      terminal: CheckMenuItem;
      scripts: CheckMenuItem;
    })
  | null = null;
let pending: Promise<void> | null = null;
const menuLabels: {
  item: { setText: (text: string) => Promise<void> };
  key: MessageKey;
}[] = [];

subscribeLocale(() => {
  for (const entry of menuLabels) {
    void entry.item.setText(t(entry.key));
  }
});

function track<T extends { setText: (text: string) => Promise<void> }>(
  item: T,
  key: MessageKey,
): T {
  menuLabels.push({ item, key });
  return item;
}
let showTerminal: (() => void) | null = null;
let showScripts: (() => void) | null = null;
let goHome: (() => void) | null = null;
let fillTerminal: (() => void) | null = null;
let restorePanels: (() => void) | null = null;
let panelState: {
  enabled: boolean;
  open: Record<CenterView, boolean>;
  terminal: boolean;
  scripts: boolean;
} = {
  enabled: false,
  open: { history: false, editor: false, browser: false },
  terminal: false,
  scripts: false,
};

export function bindTerminalPanel(show: () => void): () => void {
  showTerminal = show;
  return () => {
    if (showTerminal === show) {
      showTerminal = null;
    }
  };
}

export function bindHome(go: () => void): () => void {
  goHome = go;
  return () => {
    if (goHome === go) {
      goHome = null;
    }
  };
}

export function bindTerminalFill(fill: () => void): () => void {
  fillTerminal = fill;
  return () => {
    if (fillTerminal === fill) {
      fillTerminal = null;
    }
  };
}

export function bindRestoreScreens(restore: () => void): () => void {
  restorePanels = restore;
  return () => {
    if (restorePanels === restore) {
      restorePanels = null;
    }
  };
}

export function bindScriptsPanel(show: () => void): () => void {
  showScripts = show;
  return () => {
    if (showScripts === show) {
      showScripts = null;
    }
  };
}

export function syncWindowPanels(state: {
  enabled: boolean;
  open: Record<CenterView, boolean>;
  terminal: boolean;
  scripts: boolean;
}): void {
  panelState = state;
  if (!panels) {
    return;
  }
  for (const view of CENTER_VIEWS) {
    void panels[view].setEnabled(state.enabled);
    void panels[view].setChecked(state.enabled && state.open[view]);
  }
  void panels.terminal.setEnabled(state.enabled);
  void panels.terminal.setChecked(state.enabled && state.terminal);
  void panels.scripts.setEnabled(state.enabled);
  void panels.scripts.setChecked(state.enabled && state.scripts);
}

export function syncFileMenu(state: {
  canReopen: boolean;
  hasRepo: boolean;
}): void {
  if (!toggles) {
    return;
  }
  void toggles.reopen.setEnabled(state.canReopen);
  void toggles.editor.setEnabled(state.hasRepo);
  void toggles.terminal.setEnabled(state.hasRepo);
  void toggles.finder.setEnabled(state.hasRepo);
  void toggles.quickOpen.setEnabled(state.hasRepo);
  void toggles.terminalFill.setEnabled(state.hasRepo);
  void toggles.restoreScreens.setEnabled(state.hasRepo);
}

export function installFileMenu(): Promise<void> {
  pending ??= createFileMenu().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

async function createFileMenu(): Promise<void> {
  const reopen = track(
    await MenuItem.new({
      id: "reopen-tab",
      text: t("menu.reopen"),
      accelerator: "CmdOrCtrl+Shift+T",
      enabled: false,
      action: () => run(reopenClosedTab),
    }),
    "menu.reopen",
  );
  const editor = track(
    await MenuItem.new({
      id: "open-editor",
      text: t("menu.editor"),
      accelerator: "CmdOrCtrl+Shift+E",
      enabled: false,
      action: () => run(openActiveInEditor),
    }),
    "menu.editor",
  );
  const terminal = track(
    await MenuItem.new({
      id: "open-terminal",
      text: t("menu.terminal"),
      accelerator: "CmdOrCtrl+Alt+T",
      enabled: false,
      action: () => run(openActiveInTerminal),
    }),
    "menu.terminal",
  );
  const finder = track(
    await MenuItem.new({
      id: "reveal-repo",
      text: t("menu.finder"),
      accelerator: "CmdOrCtrl+Alt+O",
      enabled: false,
      action: () => run(revealActiveRepo),
    }),
    "menu.finder",
  );
  const home = track(
    await MenuItem.new({
      id: "go-home",
      text: t("menu.home"),
      accelerator: "CmdOrCtrl+Shift+H",
      action: () => run(() => goHome?.()),
    }),
    "menu.home",
  );
  const terminalFill = track(
    await MenuItem.new({
      id: "terminal-fill",
      text: t("menu.terminalFill"),
      accelerator: "CmdOrCtrl+L",
      enabled: false,
      action: () => run(() => fillTerminal?.()),
    }),
    "menu.terminalFill",
  );
  const restoreScreensItem = track(
    await MenuItem.new({
      id: "restore-screens",
      text: t("menu.restoreScreens"),
      enabled: false,
      action: () => run(() => restorePanels?.()),
    }),
    "menu.restoreScreens",
  );
  const quickOpen = track(
    await MenuItem.new({
      id: "quick-open",
      text: t("menu.quickOpen"),
      accelerator: "CmdOrCtrl+P",
      enabled: false,
      action: () => useCommandUi.getState().showQuickOpen(),
    }),
    "menu.quickOpen",
  );
  const historyPanel = track(
    await panelItem("show-history", t("panel.history"), "history"),
    "panel.history",
  );
  const editorPanel = track(
    await panelItem("show-editor", t("panel.editor"), "editor"),
    "panel.editor",
  );
  const browserPanel = track(
    await panelItem("show-browser", t("panel.browser"), "browser"),
    "panel.browser",
  );
  const terminalPanel = track(
    await CheckMenuItem.new({
      id: "show-terminal-panel",
      text: t("panel.terminal"),
      checked: false,
      enabled: false,
      action: () => {
        const item = panels?.terminal;
        if (item) {
          void item.setChecked(true);
        }
        run(showTerminalPanel);
      },
    }),
    "panel.terminal",
  );
  const scriptsPanel = track(
    await CheckMenuItem.new({
      id: "show-scripts-panel",
      text: t("panel.scripts"),
      checked: false,
      enabled: false,
      action: () => {
        const item = panels?.scripts;
        if (item) {
          void item.setChecked(true);
        }
        run(showScriptsPanel);
      },
    }),
    "panel.scripts",
  );

  const newTab = track(
    await MenuItem.new({
      id: "new-tab",
      text: t("menu.newTab"),
      accelerator: "CmdOrCtrl+T",
      action: () => run(openNewTab),
    }),
    "menu.newTab",
  );
  const closeTab = track(
    await MenuItem.new({
      id: "close-tab",
      text: t("menu.closeTab"),
      accelerator: "CmdOrCtrl+W",
      action: () => run(() => closeRepoTab()),
    }),
    "menu.closeTab",
  );
  const cloneRepo = track(
    await MenuItem.new({
      id: "clone-repo",
      text: t("menu.clone"),
      action: () => useCommandUi.getState().openClone(),
    }),
    "menu.clone",
  );
  const initRepo = track(
    await MenuItem.new({
      id: "init-repo",
      text: t("menu.init"),
      accelerator: "CmdOrCtrl+I",
      action: () => run(initChosenFolder),
    }),
    "menu.init",
  );
  const openRepo = track(
    await MenuItem.new({
      id: "open-repo",
      text: t("menu.open"),
      accelerator: "CmdOrCtrl+O",
      action: () => run(openChosenFolder),
    }),
    "menu.open",
  );
  const manage = track(
    await MenuItem.new({
      id: "repo-management",
      text: t("menu.manage"),
      action: () => run(showRepoManagement),
    }),
    "menu.manage",
  );

  const sizeChoices: { scale: UiScale; item: CheckMenuItem }[] = [];
  for (const scale of UI_SCALES) {
    const key = scale === 1 ? "menu.viewDefault" : null;
    const item = await CheckMenuItem.new({
      id: `ui-scale-${Math.round(scale * 100)}`,
      text: key ? t(key) : `${Math.round(scale * 100)}%`,
      checked: getUiScale() === scale,
      action: () => {
        void setUiScale(scale);
      },
    });
    if (key) {
      track(item, key);
    }
    sizeChoices.push({ scale, item });
  }
  const viewSize = track(
    await Submenu.new({
      text: t("menu.viewSize"),
      items: sizeChoices.map((choice) => choice.item),
    }),
    "menu.viewSize",
  );
  onUiScale((scale) => {
    for (const choice of sizeChoices) {
      void choice.item.setChecked(choice.scale === scale);
    }
  });

  const file = await Submenu.new({
    text: "File",
    items: [
      newTab,
      closeTab,
      reopen,
      await PredefinedMenuItem.new({ item: "Separator" }),
      cloneRepo,
      initRepo,
      openRepo,
      quickOpen,
      home,
      terminalFill,
      manage,
      await PredefinedMenuItem.new({ item: "Separator" }),
      editor,
      terminal,
      finder,
    ],
  });

  const menu = await Menu.default();
  const items = await menu.items();
  let insertAt = 1;
  let viewMenu: Submenu | null = null;
  for (const [index, item] of items.entries()) {
    const text = await item.text();
    if (text === "File" || text === "Archivo") {
      insertAt = index;
      await menu.remove(item);
    }
    if (
      (text === "View" || text === "Vista" || text === "Visualización") &&
      item instanceof Submenu
    ) {
      viewMenu = item;
    }
    if ((text === "Window" || text === "Ventana") && item instanceof Submenu) {
      for (const child of await item.items()) {
        const label = await child.text();
        if (label === "Close Window" || label === "Cerrar ventana") {
          await item.remove(child);
        }
      }
      await item.append([
        await PredefinedMenuItem.new({ item: "Separator" }),
        historyPanel,
        editorPanel,
        browserPanel,
        terminalPanel,
        scriptsPanel,
        await PredefinedMenuItem.new({ item: "Separator" }),
        restoreScreensItem,
      ]);
    }
  }
  if (viewMenu) {
    await viewMenu.append([
      await PredefinedMenuItem.new({ item: "Separator" }),
      viewSize,
    ]);
  } else {
    await menu.insert(
      await Submenu.new({ text: "View", items: [viewSize] }),
      insertAt,
    );
  }
  await menu.insert(file, insertAt);
  const previous = await menu.setAsAppMenu();
  toggles = {
    reopen,
    editor,
    terminal,
    finder,
    quickOpen,
    terminalFill,
    restoreScreens: restoreScreensItem,
  };
  panels = {
    history: historyPanel,
    editor: editorPanel,
    browser: browserPanel,
    terminal: terminalPanel,
    scripts: scriptsPanel,
  };
  syncWindowPanels(panelState);
  await previous?.close();
}

function panelItem(
  id: string,
  text: string,
  view: CenterView,
): Promise<CheckMenuItem> {
  return CheckMenuItem.new({
    id,
    text,
    checked: true,
    enabled: false,
    action: () => {
      const item = panels?.[view];
      if (item) {
        void item.setChecked(true);
      }
      run(() => showCenterView(view));
    },
  });
}

function showTerminalPanel(): void {
  showTerminal?.();
}

function showScriptsPanel(): void {
  showScripts?.();
}

function run(action: () => void | Promise<void>): void {
  void Promise.resolve()
    .then(action)
    .catch((reason: unknown) => {
      reportCommandError(reason);
    });
}
