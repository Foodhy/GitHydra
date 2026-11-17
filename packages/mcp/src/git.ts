import { execFileSync } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type {
  CommitPage,
  CommitSummary,
  LinkedWorktree,
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

export function listWorktrees(path: string): LinkedWorktree[] {
  const info = repoInfo(path);
  const output = runGit(info.path, ["worktree", "list", "--porcelain"]);
  return parseWorktreePorcelain(output, info.path);
}

export function parseWorktreePorcelain(
  output: string,
  currentPath: string,
): LinkedWorktree[] {
  const text = output.trim();
  if (text.length === 0) {
    return [];
  }
  return text.split(/\n\n/).map((block, index) => {
    let worktreePath = "";
    let headSha: string | null = null;
    let branch: string | null = null;
    let isDetached = false;
    let locked = false;
    let lockReason: string | null = null;
    let missing = false;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        headSha = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        branch = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref;
      } else if (line === "detached") {
        isDetached = true;
      } else if (line === "locked" || line.startsWith("locked ")) {
        locked = true;
        const reason = line.slice("locked".length).trim();
        lockReason = reason.length > 0 ? reason : null;
      } else if (line === "prunable" || line.startsWith("prunable ")) {
        missing = true;
      }
    }
    const isMain = index === 0;
    const isCurrent = sameWorktreePath(worktreePath, currentPath);
    return {
      path: worktreePath,
      branch: isDetached ? null : branch,
      headSha,
      isDetached,
      locked,
      lockReason,
      missing,
      isMain,
      isCurrent,
      situation: worktreeSituation({
        locked,
        lockReason,
        missing,
        isDetached,
        isMain,
        isCurrent,
        headSha,
      }),
    };
  });
}

function worktreeSituation(copy: {
  locked: boolean;
  lockReason: string | null;
  missing: boolean;
  isDetached: boolean;
  isMain: boolean;
  isCurrent: boolean;
  headSha: string | null;
}): string {
  if (copy.locked && copy.missing) {
    return "Locked and the folder is gone. Prune skips it: unlock, then prune. If the disk is just unmounted, do not unlock.";
  }
  if (copy.locked) {
    return copy.lockReason
      ? `Locked: ${copy.lockReason}. Remove fails until you unlock.`
      : "Locked. Remove fails until you unlock.";
  }
  if (copy.missing) {
    return "The folder is gone. The branch is still checked out. Prune frees it.";
  }
  if (copy.isCurrent) {
    return "This is the open folder.";
  }
  if (copy.isDetached) {
    return `Detached HEAD at ${(copy.headSha ?? "").slice(0, 7)}.`;
  }
  if (copy.isMain) {
    return "Main folder. It cannot be removed.";
  }
  return "Another folder of the same history.";
}

function sameWorktreePath(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return left === right;
  }
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

export function stageFiles(path: string, files: string[]): void {
  const info = repoInfo(path);
  const paths = cleanPaths(files);
  runGit(info.path, ["add", "--", ...paths]);
}

export function unstageFiles(path: string, files: string[]): void {
  const info = repoInfo(path);
  const paths = cleanPaths(files);
  runGit(info.path, ["restore", "--staged", "--", ...paths]);
}

export function proposeCommit(
  path: string,
  summary: string,
  description: string,
): void {
  const info = repoInfo(path);
  const text = summary.trim();
  if (text.length === 0) {
    throw new GitToolError("The commit summary is empty");
  }
  writeAgentNote(info.path, "githydra-proposal.json", {
    summary: text,
    description: description.trim(),
  });
}

export function createBranch(
  path: string,
  name: string,
  sha: string | undefined,
): { name: string; head: string | null } {
  const info = repoInfo(path);
  const branch = name.trim();
  if (branch.length === 0 || branch.includes("..")) {
    throw new GitToolError("Invalid branch name");
  }
  const before = info.headSha;
  if (sha && sha.trim().length > 0) {
    runGit(info.path, ["branch", branch, sha.trim()]);
  } else {
    runGit(info.path, ["branch", branch]);
  }
  const after = tryGit(info.path, ["rev-parse", "--verify", "HEAD"]);
  if (after !== before) {
    throw new GitToolError("Creating the branch moved HEAD");
  }
  return { name: branch, head: after };
}

export function showDiff(path: string, file: string, staged: boolean): void {
  const info = repoInfo(path);
  const target = file.trim();
  if (target.length === 0) {
    throw new GitToolError("Missing file path");
  }
  const known = workingTree(info.path).entries.some(
    (entry) => entry.path === target,
  );
  if (!known) {
    throw new GitToolError(`That file is not in the working tree: ${target}`);
  }
  writeAgentNote(info.path, "githydra-show.json", { file: target, staged });
}

function cleanPaths(files: string[]): string[] {
  const paths = files
    .map((file) => file.trim())
    .filter((file) => file.length > 0);
  if (paths.length === 0) {
    throw new GitToolError("Missing file path");
  }
  return paths;
}

function writeAgentNote(repoPath: string, name: string, value: unknown): void {
  const dir = runGit(repoPath, ["rev-parse", "--git-path", "."]).trim();
  const gitDir = isAbsolute(dir) ? dir : join(repoPath, dir);
  writeFileSync(join(gitDir, name), `${JSON.stringify(value)}\n`);
}
