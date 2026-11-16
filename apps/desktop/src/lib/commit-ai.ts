import type { CommitAgentId } from "@githydra/contracts";
import { load } from "@tauri-apps/plugin-store";

export const COMMIT_AGENTS: { id: CommitAgentId; label: string }[] = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
];

export interface CommitAi {
  enabled: boolean;
  providers: CommitAgentId[];
}

const FILE = "commit-ai.json";
const DEFAULTS: CommitAi = {
  enabled: true,
  providers: ["cursor"],
};

export function commitAgentLabel(id: string): string {
  return COMMIT_AGENTS.find((agent) => agent.id === id)?.label ?? id;
}

export function normalizeCommitAi(value: unknown): CommitAi {
  if (!value || typeof value !== "object") {
    return { ...DEFAULTS, providers: [...DEFAULTS.providers] };
  }
  const raw = value as { enabled?: unknown; providers?: unknown };
  const enabled =
    typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled;
  const listed = Array.isArray(raw.providers)
    ? raw.providers
    : DEFAULTS.providers;
  const providers = COMMIT_AGENTS.map((agent) => agent.id).filter((id) =>
    listed.includes(id),
  );
  if (enabled && providers.length === 0) {
    return { enabled, providers: [...DEFAULTS.providers] };
  }
  return { enabled, providers };
}

export async function readCommitAi(): Promise<CommitAi> {
  try {
    const store = await load(FILE, { autoSave: false, defaults: {} });
    return normalizeCommitAi(await store.get("commitAi"));
  } catch {
    return { ...DEFAULTS, providers: [...DEFAULTS.providers] };
  }
}

export async function saveCommitAi(ai: CommitAi): Promise<void> {
  const next = normalizeCommitAi(ai);
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("commitAi", next);
  await store.save();
}
