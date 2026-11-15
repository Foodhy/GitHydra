import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type {
  CommitPage,
  CommitSummary,
  RepositoryInfo,
  WorkingTreeEntry,
  WorkingTreeKind,
  WorkingTreeStatus,
} from "@githydra/contracts";

export class GitToolError extends Error {}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stderr?: string | Buffer; message?: string };
    const stderr =
      typeof failure.stderr === "string"
        ? failure.stderr
        : failure.stderr?.toString("utf8");
    throw new GitToolError((stderr ?? failure.message ?? "git falló").trim());
  }
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return runGit(cwd, args).trim();
  } catch {
    return null;
  }
}

export function repoInfo(path: string): RepositoryInfo {
  const root = tryGit(path, ["rev-parse", "--show-toplevel"]);
  if (!root) {
    throw new GitToolError(`No es un repositorio git: ${path}`);
  }
  const head = tryGit(root, ["rev-parse", "--verify", "HEAD"]);
  const branch = tryGit(root, ["symbolic-ref", "--short", "HEAD"]);
  return {
    path: root,
    name: basename(root),
    currentBranch: branch,
    headSha: head,
    isDetached: head !== null && branch === null,
  };
}

export function listCommits(
  path: string,
  limit: number | undefined,
  cursor: string | undefined,
): CommitPage {
  const info = repoInfo(path);
  const size = clampLimit(limit);
  if (!info.headSha) {
    return { commits: [], nextCursor: null };
  }
  const listed = runGit(info.path, ["rev-list", "--date-order", "HEAD"]);
  const shas = listed.split("\n").filter((sha) => sha.length > 0);
  let start = 0;
  if (cursor && cursor.trim().length > 0) {
    const index = shas.indexOf(cursor.trim());
    if (index < 0) {
      return { commits: [], nextCursor: null };
    }
    start = index + 1;
  }
  const window = shas.slice(start, start + size + 1);
  const page = window.slice(0, size);
  const commits = page.length === 0 ? [] : readCommits(info.path, page);
  return {
    commits,
    nextCursor: window.length > size ? (page.at(-1) ?? null) : null,
  };
}

export function workingTree(path: string): WorkingTreeStatus {
  const info = repoInfo(path);
  const output = runGit(info.path, ["status", "--porcelain=v1", "-z", "-uall"]);
  return { entries: parseStatus(output) };
}

function readCommits(path: string, shas: string[]): CommitSummary[] {
  const output = runGit(path, [
    "log",
    "-z",
    "--no-walk=unsorted",
    `--format=${COMMIT_FORMAT}`,
    ...shas,
  ]);
  return output
    .split("\0")
    .filter((record) => record.length > 0)
    .map(parseCommit);
}

const COMMIT_FORMAT = "%H%x1f%aI%x1f%an%x1f%ae%x1f%P%x1f%B";

function parseCommit(record: string): CommitSummary {
  const [
    sha = "",
    authoredAt = "",
    authorName = "",
    authorEmail = "",
    parents = "",
    message = "",
  ] = record.split("\x1f");
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: message.trim(),
    authorName,
    authorEmail,
    authoredAt,
    parentShas: parents.length === 0 ? [] : parents.split(" "),
  };
}

function parseStatus(output: string): WorkingTreeEntry[] {
  const entries: WorkingTreeEntry[] = [];
  let index = 0;
  while (index < output.length) {
    const end = output.indexOf("\0", index);
    if (end < 0) {
      break;
    }
    const header = output.slice(index, end);
    index = end + 1;
    if (header.length < 4) {
      continue;
    }
    const indexCode = header[0] ?? " ";
    const workCode = header[1] ?? " ";
    let file = header.slice(3);
    if (isRename(indexCode) || isRename(workCode)) {
      const next = output.indexOf("\0", index);
      if (next < 0) {
        break;
      }
      file = output.slice(index, next);
      index = next + 1;
    }
    if (isConflict(indexCode, workCode)) {
      entries.push({ path: file, kind: "conflicted", staged: false });
      continue;
    }
    const staged = kindFor(indexCode, true);
    const unstaged = kindFor(workCode, false);
    if (staged) {
      entries.push({ path: file, kind: staged, staged: true });
    }
    if (unstaged) {
      entries.push({ path: file, kind: unstaged, staged: false });
    }
  }
  return entries;
}

function isRename(code: string): boolean {
  return code === "R" || code === "C";
}

function isConflict(indexCode: string, workCode: string): boolean {
  return (
    indexCode === "U" ||
    workCode === "U" ||
    (indexCode === "A" && workCode === "A") ||
    (indexCode === "D" && workCode === "D")
  );
}

function kindFor(code: string, staged: boolean): WorkingTreeKind | null {
  switch (code) {
    case "M":
      return "modified";
    case "A":
    case "C":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "T":
      return "typechange";
    case "?":
      return staged ? null : "untracked";
    default:
      return null;
  }
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 80;
  }
  return Math.min(200, Math.max(1, Math.floor(limit)));
}
