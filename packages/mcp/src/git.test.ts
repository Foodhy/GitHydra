import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listCommits, repoInfo, workingTree } from "./git.ts";
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

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
