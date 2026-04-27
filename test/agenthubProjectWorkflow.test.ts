import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { GitCommandRunner } from "../src/agenthub/gitRunner.js"
import { AgentHubProjectService } from "../src/agenthub/projectService.js"
import { deriveWorkflowViewModelFromProjectScan } from "../src/agenthub/projectWorkflow.js"
import { renderWorkflowView, WorkflowCliView } from "../src/tui/workflowTree.js"
import type { ThreadBinding } from "../src/types.js"

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

  it("projects managed agent bindings onto matching scanned worktrees", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-agent-projection-"))
    const source = path.join(root, "source")
    const plainDir = path.join(root, "demo")
    createSourceRepo(source)

    const service = new AgentHubProjectService({
      git: new GitCommandRunner({ timeoutMs: 10_000 }),
      projects: [{ id: "demo", label: "Demo Project", path: plainDir }],
    })

    await service.createProject({ plainDir, repo: source, branch: "main" })
    const mainWorktreePath = path.join(plainDir, "main")
    const scan = await service.scanProject(plainDir)
    const model = deriveWorkflowViewModelFromProjectScan(scan, {
      bindings: [testBinding({
        threadId: "agenthub:thr-agent-1",
        sessionId: "thr-agent-1",
        workspacePath: mainWorktreePath,
        state: "bound_idle",
      })],
    })

    const project = model.projects[0]!
    expect(project.summary.agents).toBe(1)
    expect(project.agents).toMatchObject([{
      id: "codex-thr-agent-1",
      provider: "codex",
      mode: "write",
      status: "idle",
      worktree: project.worktrees[0]!.id,
    }])
    expect(project.workItems.some((item) => item.agents.length === 1)).toBe(true)

    const output = renderWorkflowView(model, WorkflowCliView.Agents)
    expect(output).toContain("Agents View")
    expect(output).toContain("[.] ◎ Codex codex-thr-agent-1")
    expect(output).toContain(`worktree: ${fs.realpathSync(mainWorktreePath)}`)
  })

  it("can scan one unlisted local repository for CLI project onboarding", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-unlisted-"))
    createSourceRepo(root)

    const service = new AgentHubProjectService({
      git: new GitCommandRunner({ timeoutMs: 10_000 }),
      projects: [],
    })

    const scan = await service.scanProject(root)
    expect(scan.id).toStartWith("local-agenthub-unlisted")
    expect(scan.label).toBe(path.basename(root))
    expect(scan.worktrees).toHaveLength(1)
    expect(scan.commits.map((commit) => commit.subject)).toContain("Initial commit")
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

function testBinding(overrides: Partial<ThreadBinding>): ThreadBinding {
  const now = "2026-04-27T00:00:00.000Z"
  return {
    threadId: "agenthub:thr-test",
    sessionId: "thr-test",
    provider: "codex",
    backend: "app-server",
    workspaceId: null,
    workspaceLabel: "main",
    workspacePath: "/tmp/demo/main",
    permissionProfile: "workspace-write",
    state: "bound_idle",
    createdAt: now,
    updatedAt: now,
    lastError: null,
    lastReadMessageId: null,
    ...overrides,
  }
}
