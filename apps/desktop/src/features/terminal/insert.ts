export const TERMINAL_INSERT = "githydra-terminal-insert";
export const PATH_DRAG_MARK = "githydra-path:";

const SAFE_PATH = /^[A-Za-z0-9._@%+=:,/-]+$/;

export function shellToken(relative: string): string {
  if (SAFE_PATH.test(relative)) {
    return `${relative} `;
  }
  return `'${relative.replace(/'/g, "'\\''")}' `;
}

export function insertTerminalPath(relative: string): void {
  window.dispatchEvent(
    new CustomEvent(TERMINAL_INSERT, { detail: shellToken(relative) }),
  );
}

export function pathDragValue(relative: string): string {
  return `${PATH_DRAG_MARK}${relative}`;
}

export function pathFromDrop(value: string): string | null {
  if (!value.startsWith(PATH_DRAG_MARK)) {
    return null;
  }
  const relative = value.slice(PATH_DRAG_MARK.length);
  return relative.length > 0 ? relative : null;
}
