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

interface ToggleItems {
  reopen: MenuItem;
  editor: MenuItem;
  terminal: MenuItem;
  finder: MenuItem;
  quickOpen: MenuItem;
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
  for (const [index, item] of items.entries()) {
    const text = await item.text();
    if (text === "File" || text === "Archivo") {
      insertAt = index;
      await menu.remove(item);
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
      ]);
    }
  }
  await menu.insert(file, insertAt);
  const previous = await menu.setAsAppMenu();
  toggles = { reopen, editor, terminal, finder, quickOpen };
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
