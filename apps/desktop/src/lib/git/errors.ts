import type { GitErrorCode } from "@githydra/contracts";
import { getLocale } from "../i18n";
import { translateGitMessage } from "./git-text";

const CODES: GitErrorCode[] = ["NOT_A_REPO", "IO_ERROR", "NOT_IMPLEMENTED"];

export class GitClientError extends Error {
  readonly code: GitErrorCode;

  constructor(code: GitErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function toGitClientError(error: unknown): GitClientError {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/(NOT_A_REPO|IO_ERROR|NOT_IMPLEMENTED)\|(.*)$/s);
  if (match && isCode(match[1])) {
    return new GitClientError(
      match[1],
      translateGitMessage(match[2] ?? raw, getLocale()),
    );
  }
  return new GitClientError("IO_ERROR", translateGitMessage(raw, getLocale()));
}

function isCode(value: string): value is GitErrorCode {
  return CODES.some((code) => code === value);
}
