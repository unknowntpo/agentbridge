import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { GitCommandRunner } from "../src/agenthub/gitRunner.js"
import { AgentHubProjectService } from "../src/agenthub/projectService.js"
import { deriveWorkflowViewModelFromProjectScan } from "../src/agenthub/projectWorkflow.js"
import { renderWorkflowView, WorkflowCliView } from "../src/tui/workflowTree.js"

describe("AgentHub real Git workflow projection", () => {
  it("syncs project, worktree, and commit state into a TUI workflow model", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-real-sync-"))
    const source = path.join(root, "source")
    const plainDir = path.join(root, "demo")
    createSourceRepo(source)

    const service = new AgentHubProjectService({
      git: new GitCommandRunner({ timeoutMs: 10_000 }),
      projects: [{ id: "demo", label: "Demo Project", path: plainDir }],
    })

    await service.createProject({ plainDir, repo: source, branch: "main" })
    await service.createWorktree({
      projectPath: plainDir,
      slug: "checkout-retry",
      branch: "agent/checkout-retry",
      base: "main",
    })
    fs.writeFileSync(path.join(plainDir, "checkout-retry", "retry.txt"), "retry\n")
    git(path.join(plainDir, "checkout-retry"), ["add", "retry.txt"])
    git(path.join(plainDir, "checkout-retry"), ["-c", "user.name=AgentHub Test", "-c", "user.email=agenthub@example.test", "commit", "-m", "Add checkout retry"])

    const scan = await service.scanProject(plainDir)
    expect(scan.commits.map((commit) => commit.subject)).toContain("Add checkout retry")
    expect(scan.commits.map((commit) => commit.subject)).toContain("Initial commit")

    const model = deriveWorkflowViewModelFromProjectScan(scan)
    expect(model.projects[0]?.summary.commits).toBeGreaterThanOrEqual(2)
    expect(model.projects[0]?.worktrees.map((worktree) => worktree.name)).toContain("checkout-retry")

    const output = renderWorkflowView(model, WorkflowCliView.Commits)
    expect(output).toContain("Commit View")
    expect(output).toContain("Add checkout retry")
    expect(output).toContain("refs: agent/checkout-retry")
    expect(output).toContain("worktrees: checkout-retry clean +0/-0")
  })
})

function createSourceRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, ["init", "--initial-branch=main"])
  fs.writeFileSync(path.join(dir, "README.md"), "# demo\n")
  git(dir, ["add", "README.md"])
  git(dir, ["-c", "user.name=AgentHub Test", "-c", "user.email=agenthub@example.test", "commit", "-m", "Initial commit"])
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  })
}
