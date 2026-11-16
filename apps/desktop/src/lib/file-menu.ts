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
}

let toggles: ToggleItems | null = null;
let panels:
  | (Record<CenterView, CheckMenuItem> & {
      terminal: CheckMenuItem;
    })
  | null = null;
let pending: Promise<void> | null = null;
let showTerminal: (() => void) | null = null;
let panelState: {
  enabled: boolean;
  open: Record<CenterView, boolean>;
  terminal: boolean;
} = {
  enabled: false,
  open: { history: false, editor: false, browser: false },
  terminal: false,
};

export function bindTerminalPanel(show: () => void): () => void {
  showTerminal = show;
  return () => {
    if (showTerminal === show) {
      showTerminal = null;
    }
  };
}

export function syncWindowPanels(state: {
  enabled: boolean;
  open: Record<CenterView, boolean>;
  terminal: boolean;
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
}

export function installFileMenu(): Promise<void> {
  pending ??= createFileMenu().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

async function createFileMenu(): Promise<void> {
  const reopen = await MenuItem.new({
    id: "reopen-tab",
    text: "Reabrir pestaña cerrada",
    accelerator: "CmdOrCtrl+Shift+T",
    enabled: false,
    action: () => run(reopenClosedTab),
  });
  const editor = await MenuItem.new({
    id: "open-editor",
    text: "Abrir en el editor externo",
    accelerator: "CmdOrCtrl+Shift+E",
    enabled: false,
    action: () => run(openActiveInEditor),
  });
  const terminal = await MenuItem.new({
    id: "open-terminal",
    text: "Abrir terminal externa",
    accelerator: "CmdOrCtrl+Alt+T",
    enabled: false,
    action: () => run(openActiveInTerminal),
  });
  const finder = await MenuItem.new({
    id: "reveal-repo",
    text: "Mostrar en el Finder",
    accelerator: "CmdOrCtrl+Alt+O",
    enabled: false,
    action: () => run(revealActiveRepo),
  });
  const historyPanel = await panelItem("show-history", "Historial", "history");
  const editorPanel = await panelItem("show-editor", "Editor", "editor");
  const browserPanel = await panelItem("show-browser", "Browser", "browser");
  const terminalPanel = await CheckMenuItem.new({
    id: "show-terminal-panel",
    text: "Terminal",
    checked: false,
    enabled: false,
    action: () => {
      const item = panels?.terminal;
      if (item) {
        void item.setChecked(true);
      }
      run(showTerminalPanel);
    },
  });

  const file = await Submenu.new({
    text: "File",
    items: [
      await MenuItem.new({
        id: "new-tab",
        text: "Nueva pestaña",
        accelerator: "CmdOrCtrl+T",
        action: () => run(openNewTab),
      }),
      await MenuItem.new({
        id: "close-tab",
        text: "Cerrar pestaña",
        accelerator: "CmdOrCtrl+W",
        action: () => run(() => closeRepoTab()),
      }),
      reopen,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "clone-repo",
        text: "Clonar repositorio…",
        action: () => useCommandUi.getState().openClone(),
      }),
      await MenuItem.new({
        id: "init-repo",
        text: "Iniciar repositorio…",
        accelerator: "CmdOrCtrl+I",
        action: () => run(initChosenFolder),
      }),
      await MenuItem.new({
        id: "open-repo",
        text: "Abrir repositorio…",
        accelerator: "CmdOrCtrl+O",
        action: () => run(openChosenFolder),
      }),
      await MenuItem.new({
        id: "repo-management",
        text: "Gestión de repositorios",
        action: () => run(showRepoManagement),
      }),
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
      ]);
    }
  }
  await menu.insert(file, insertAt);
  const previous = await menu.setAsAppMenu();
  toggles = { reopen, editor, terminal, finder };
  panels = {
    history: historyPanel,
    editor: editorPanel,
    browser: browserPanel,
    terminal: terminalPanel,
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

function run(action: () => void | Promise<void>): void {
  void Promise.resolve()
    .then(action)
    .catch((reason: unknown) => {
      reportCommandError(reason);
    });
}
