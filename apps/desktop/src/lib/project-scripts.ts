import {
  emptyScripts,
  type ProjectScripts,
  parseScripts,
  SCRIPTS_FILE,
  serializeScripts,
} from "@githydra/contracts";
import { toGitClientError } from "./git/errors";
import { createWorkdirDir, readWorkdirFile, writeWorkdirFile } from "./workdir";

export async function loadProjectScripts(
  path: string,
): Promise<ProjectScripts> {
  try {
    const file = await readWorkdirFile(path, SCRIPTS_FILE);
    const parsed = parseScripts(file.text);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    return parsed.book;
  } catch (reason: unknown) {
    const message =
      reason instanceof Error
        ? reason.message
        : toGitClientError(reason).message;
    if (message.includes("no está")) {
      return emptyScripts();
    }
    throw reason instanceof Error ? reason : new Error(message);
  }
}

export async function saveProjectScripts(
  path: string,
  book: ProjectScripts,
): Promise<void> {
  try {
    await createWorkdirDir(path, "", ".githydra");
  } catch (reason: unknown) {
    const message = toGitClientError(reason).message;
    if (!message.includes("Ya existe")) {
      throw reason;
    }
  }
  await writeWorkdirFile(path, SCRIPTS_FILE, serializeScripts(book));
}
