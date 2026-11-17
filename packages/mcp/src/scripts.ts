import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyScripts,
  type ProjectScripts,
  parseScripts,
  putScript,
  SCRIPTS_FILE,
  serializeScripts,
} from "@githydra/contracts";
import { GitToolError, repoInfo } from "./git.js";

export function listScripts(path: string): ProjectScripts {
  const root = repoInfo(path).path;
  const file = join(root, SCRIPTS_FILE);
  try {
    const parsed = parseScripts(readFileSync(file, "utf8"));
    if ("error" in parsed) {
      throw new GitToolError(parsed.error);
    }
    return parsed.book;
  } catch (error) {
    if (error instanceof GitToolError) {
      throw error;
    }
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return emptyScripts();
    }
    throw new GitToolError("No se pudo leer scripts.json.");
  }
}

export function addScript(
  path: string,
  name: string,
  command: string,
): ProjectScripts {
  const root = repoInfo(path).path;
  const next = putScript(listScripts(root), name, command);
  if ("error" in next) {
    throw new GitToolError(next.error);
  }
  const file = join(root, SCRIPTS_FILE);
  mkdirSync(join(root, ".githydra"), { recursive: true });
  writeFileSync(file, serializeScripts(next.book));
  return next.book;
}
