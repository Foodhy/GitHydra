import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createBranch,
  listCommits,
  listWorktrees,
  parseWorktreePorcelain,
  proposeCommit,
  repoInfo,
  showDiff,
  stageFiles,
  unstageFiles,
  workingTree,
} from "./git.ts";
import { resolveRepoPath } from "./session.ts";

test("lee info, un commit y un archivo sin seguimiento", () => {
  const dir = mkdtempSync(join(tmpdir(), "githydra-mcp-"));
  try {
    git(dir, ["init", "-b", "main"]);
    git(dir, ["config", "user.name", "Hydra"]);
    git(dir, ["config", "user.email", "hydra@example.com"]);
    writeFileSync(join(dir, "README.md"), "uno\n");
    git(dir, ["add", "README.md"]);
    git(dir, ["commit", "-m", "first"]);
    writeFileSync(join(dir, "notes.txt"), "pendiente\n");

    const info = repoInfo(dir);
    assert.equal(info.currentBranch, "main");
    assert.equal(info.isDetached, false);
    assert.ok(info.headSha);

    const page = listCommits(info.path, 10, undefined);
    assert.equal(page.commits.length, 1);
    assert.equal(page.commits[0]?.message, "first");
    assert.equal(page.nextCursor, null);

    const status = workingTree(info.path);
    assert.ok(
      status.entries.some(
        (entry) =>
          entry.path === "notes.txt" &&
          entry.kind === "untracked" &&
          !entry.staged,
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("la ruta del argumento gana, luego el entorno, luego la sesión", () => {
  assert.equal(
    resolveRepoPath({
      args: { path: " /desde-arg " },
      envPath: "/desde-env",
      sessionPath: "/desde-app",
    }),
    "/desde-arg",
  );
  assert.equal(
    resolveRepoPath({
      args: {},
      envPath: " /desde-env ",
      sessionPath: "/desde-app",
    }),
    "/desde-env",
  );
  assert.equal(
    resolveRepoPath({
      args: {},
      envPath: undefined,
      sessionPath: "/desde-app",
    }),
    "/desde-app",
  );
  assert.equal(
    resolveRepoPath({
      args: {},
      envPath: " ",
      sessionPath: null,
    }),
    null,
  );
});

test("lista la copia enlazada y explica un candado sin carpeta", () => {
  const dir = mkdtempSync(join(tmpdir(), "githydra-mcp-wt-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.name", "Hydra"]);
    git(repo, ["config", "user.email", "hydra@example.com"]);
    writeFileSync(join(repo, "README.md"), "uno\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "first"]);
    const sibling = join(dir, "repo-prueba");
    git(repo, ["worktree", "add", "-b", "prueba", sibling]);

    const rows = listWorktrees(repo);
    const main = rows.find((row) => row.isMain);
    const copy = rows.find((row) => row.branch === "prueba");
    assert.equal(main?.isCurrent, true);
    assert.equal(main?.situation, "This is the open folder.");
    assert.equal(copy?.missing, false);
    assert.equal(copy?.locked, false);
    assert.equal(copy?.situation, "Another folder of the same history.");

    const stuck = parseWorktreePorcelain(
      [
        "worktree /code/app",
        "HEAD abcdef1",
        "branch refs/heads/main",
        "",
        "worktree /code/app-gone",
        "HEAD abcdef1",
        "branch refs/heads/feature/gone",
        "locked agente",
        "prunable gitdir file points to non-existent location",
      ].join("\n"),
      "/code/app",
    );
    const gone = stuck.find((row) => row.branch === "feature/gone");
    assert.equal(gone?.locked, true);
    assert.equal(gone?.missing, true);
    assert.equal(gone?.lockReason, "agente");
    assert.equal(gone?.isMain, false);
    assert.match(gone?.situation ?? "", /unlock, then prune/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("el agente prepara stage, mensaje y rama sin mover HEAD", () => {
  const dir = mkdtempSync(join(tmpdir(), "githydra-mcp-agent-"));
  try {
    git(dir, ["init", "-b", "main"]);
    git(dir, ["config", "user.name", "Hydra"]);
    git(dir, ["config", "user.email", "hydra@example.com"]);
    writeFileSync(join(dir, "README.md"), "uno\n");
    git(dir, ["add", "README.md"]);
    git(dir, ["commit", "-m", "first"]);
    writeFileSync(join(dir, "notes.txt"), "pendiente\n");

    const before = repoInfo(dir).headSha;
    stageFiles(dir, ["notes.txt"]);
    const staged = workingTree(dir);
    assert.ok(
      staged.entries.some(
        (entry) => entry.path === "notes.txt" && entry.staged,
      ),
    );
    unstageFiles(dir, ["notes.txt"]);
    const back = workingTree(dir);
    assert.ok(
      back.entries.some((entry) => entry.path === "notes.txt" && !entry.staged),
    );

    proposeCommit(dir, "note the file", "why it belongs");
    const proposal = JSON.parse(
      readFileSync(join(dir, ".git", "githydra-proposal.json"), "utf8"),
    ) as { summary: string; description: string };
    assert.equal(proposal.summary, "note the file");
    assert.equal(proposal.description, "why it belongs");

    stageFiles(dir, ["notes.txt"]);
    showDiff(dir, "notes.txt", true);
    const shown = JSON.parse(
      readFileSync(join(dir, ".git", "githydra-show.json"), "utf8"),
    ) as { file: string; staged: boolean };
    assert.equal(shown.file, "notes.txt");
    assert.equal(shown.staged, true);

    const created = createBranch(dir, "agent-topic");
    assert.equal(created.name, "agent-topic");
    assert.equal(created.head, before);
    assert.equal(repoInfo(dir).currentBranch, "main");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
