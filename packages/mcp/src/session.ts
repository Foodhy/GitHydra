import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function sessionFilePath(): string {
  const home = homedir();
  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "com.githydra.app",
      "session.json",
    );
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(base, "com.githydra.app", "session.json");
  }
  const base = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  return join(base, "com.githydra.app", "session.json");
}

export function readSessionPath(file = sessionFilePath()): string | null {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { path?: unknown };
    if (typeof raw.path !== "string") {
      return null;
    }
    const path = raw.path.trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

export function resolveRepoPath(input: {
  args: Record<string, unknown> | undefined;
  envPath: string | undefined;
  sessionPath: string | null;
}): string | null {
  const fromArgs = input.args?.path;
  if (typeof fromArgs === "string" && fromArgs.trim().length > 0) {
    return fromArgs.trim();
  }
  const fromEnv = input.envPath?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return input.sessionPath;
}
