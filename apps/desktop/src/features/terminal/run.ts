import {
  addTerminal,
  createTerminal,
  TERMINAL_LIMIT,
  type TerminalTab,
} from "./sessions.ts";

export const TERMINAL_RUN = "githydra-terminal-run";

export interface TerminalJob {
  text: string;
  clear: boolean;
}

export interface RunRequest {
  tabId: string | "new";
  command: string;
  clear: boolean;
}

export function commandLine(command: string): string {
  const text = command.replace(/[\r\n]/g, "").trim();
  return `${text}\r`;
}

export function applyRuns(
  tabs: readonly TerminalTab[],
  requests: readonly RunRequest[],
  createId: () => string,
): {
  tabs: TerminalTab[];
  active: string | null;
  jobs: { tabId: string; job: TerminalJob }[];
} {
  let next = [...tabs];
  let active: string | null = null;
  const jobs: { tabId: string; job: TerminalJob }[] = [];
  for (const request of requests) {
    let tabId = request.tabId;
    if (request.tabId === "new") {
      if (next.length >= TERMINAL_LIMIT) {
        continue;
      }
      const tab = createTerminal(createId(), next.length);
      next = addTerminal(next, tab);
      tabId = tab.id;
    } else if (!next.some((tab) => tab.id === tabId)) {
      continue;
    }
    active = tabId;
    jobs.push({
      tabId,
      job: { text: commandLine(request.command), clear: request.clear },
    });
  }
  return { tabs: next, active, jobs };
}

export function releaseHeld(
  ready: boolean,
  held: readonly TerminalJob[],
): { send: TerminalJob[]; hold: TerminalJob[] } {
  if (!ready) {
    return { send: [], hold: [...held] };
  }
  return { send: [...held], hold: [] };
}

const inbox: RunRequest[] = [];
const boxes = new Map<string, TerminalJob[]>();

export function pushRun(request: RunRequest): void {
  inbox.push(request);
  window.dispatchEvent(new CustomEvent(TERMINAL_RUN));
}

export function takeRuns(): RunRequest[] {
  return inbox.splice(0, inbox.length);
}

export function pushJob(tabId: string, job: TerminalJob): void {
  const list = boxes.get(tabId) ?? [];
  list.push(job);
  boxes.set(tabId, list);
}

export function pullJobs(tabId: string): TerminalJob[] {
  const list = boxes.get(tabId) ?? [];
  boxes.delete(tabId);
  return list;
}
