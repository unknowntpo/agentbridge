import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { GitCommandRunner } from "../src/agenthub/gitRunner.js"
import { AgentHubProjectService } from "../src/agenthub/projectService.js"

describe("AgentHub project service integration", () => {
  it("creates a plain project, scans main, and creates a sibling worktree", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-service-"))
    const source = path.join(root, "source")
    const plainDir = path.join(root, "demo")
    createSourceRepo(source)

    const service = new AgentHubProjectService({
      git: new GitCommandRunner({ timeoutMs: 10_000 }),
      projects: [{ id: "demo", label: "demo", path: plainDir }],
    })

    const created = await service.createProject({ plainDir, repo: source, branch: "main" })
    const canonicalPlainDir = fs.realpathSync(plainDir)
    expect(created.ok).toBe(true)
    expect(fs.existsSync(path.join(plainDir, "main", ".git"))).toBe(true)

    const scan = await service.scanProject(plainDir)
    expect(scan.anchorPath).toBe(path.join(canonicalPlainDir, "main"))
    expect(scan.worktrees.map((worktree) => worktree.name)).toContain("main")

    const outcome = await service.createWorktree({
      projectPath: plainDir,
      slug: "feature-a",
      branch: "codex/feature-a",
      base: "main",
    })
    expect(outcome.ok).toBe(true)
    expect(fs.existsSync(path.join(canonicalPlainDir, "feature-a", ".git"))).toBe(true)

    const after = await service.scanProject(plainDir)
    expect(after.worktrees.map((worktree) => worktree.name).sort()).toEqual(["feature-a", "main"])
  })
})

function createSourceRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ["init", "--initial-branch=main"])
  fs.writeFileSync(path.join(dir, "README.md"), "# demo\n")
  git(dir, ["add", "README.md"])
  git(dir, ["-c", "user.name=AgentHub Test", "-c", "user.email=agenthub@example.test", "commit", "-m", "init"])
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  })
}
