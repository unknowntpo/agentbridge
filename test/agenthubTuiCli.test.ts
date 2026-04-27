import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "bun:test"

import { getViewportWindow, WORKFLOW_TUI_CONTROLS } from "../src/tui/WorkflowTui.js"
import { parseWorkflowCliView } from "../src/tui/workflowTree.js"

describe("AgentHub TUI CLI", () => {
  it("keeps TUI view-switching controls visible as a product contract", () => {
    expect([...WORKFLOW_TUI_CONTROLS]).toEqual([
      "tab  next view",
      "1    task-tree",
      "2    dependency",
      "3    ready",
      "4    agents",
      "5    commits",
      "q    quit",
    ])
  })

  it("keeps focused rows inside a bounded viewport for long TUI views", () => {
    expect(getViewportWindow(0, 80, 6)).toEqual({ start: 0, end: 6, total: 80 })
    expect(getViewportWindow(20, 80, 6)).toEqual({ start: 17, end: 23, total: 80 })
    expect(getViewportWindow(79, 80, 6)).toEqual({ start: 74, end: 80, total: 80 })
    expect(getViewportWindow(0, 0, 6)).toEqual({ start: 0, end: 0, total: 0 })
  })

  it("does not expose the removed lifecycle view as a workflow projection", () => {
    expect(() => parseWorkflowCliView("lifecycle")).toThrow("workflow view must be one of: task-tree, dependency, ready, agents, commits")
  })

  it("prints a deterministic workflow tree without starting an interactive terminal", () => {
    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--file",
      path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    expect(stdout).toContain("MiniShop Demo")
    expect(stdout).toContain("issue gh-130 Extract benchmark result dashboard [review]")
    expect(stdout).toContain("agents: claude read idle")
    expect(stdout).toContain("pr: pr-45 review_requested checks:passing")
    expect(stdout).toContain("deps: gh-121(in_progress), gh-120(todo)")
  })

  it("prints a selected TUI view in non-interactive mode", () => {
    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--file",
      path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
      "--view",
      "agents",
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    expect(stdout).toContain("Agents View")
    expect(stdout).toContain("[*] [Cx] codex-gh-121")
    expect(stdout).toContain("provider: Codex   mode: write   status: running")
    expect(stdout).not.toContain("summary: 2 epics")
  })

  it("prints a dependency workflow view", () => {
    const stdout = runWorkflowView("dependency")

    expect(stdout).toContain("Dependency View")
    expect(stdout).toContain("gh-120 [todo] Fix checkout timeout")
    expect(stdout).toContain("├─> gh-121 [in_progress] Add checkout retry metrics")
    expect(stdout).toContain("└─> gh-130 [review] Extract benchmark result dashboard")
    expect(stdout).toContain("gh-121 [in_progress] Add checkout retry metrics")
    expect(stdout).toContain("└─> gh-130 [review] Extract benchmark result dashboard")
  })

  it("prints a ready queue view", () => {
    const stdout = runWorkflowView("ready")

    expect(stdout).toContain("Ready View")
    expect(stdout).toContain("Ready")
    expect(stdout).toContain("gh-120 Fix checkout timeout [todo]")
    expect(stdout).toContain("Blocked")
    expect(stdout).toContain("gh-130 Extract benchmark result dashboard [review]")
    expect(stdout).toContain("blocked by: gh-121(in_progress), gh-120(todo)")
  })

  it("prints an agents view", () => {
    const stdout = runWorkflowView("agents")

    expect(stdout).toContain("Agents View")
    expect(stdout).toContain("[*] [Cx] codex-gh-121")
    expect(stdout).toContain("provider: Codex   mode: write   status: running")
    expect(stdout).toContain("branch: agent/gh-121-checkout-retry")
    expect(stdout).toContain("worktree: wt/checkout-retry")
    expect(stdout).toContain("task: gh-121 Add checkout retry metrics [in_progress]")
    expect(stdout).toContain("deps: gh-120(todo)")
    expect(stdout).toContain("[.] [CC] claude-gh-130")
    expect(stdout).toContain("provider: Claude Code   mode: read   status: idle")
  })

  it("prints a real project commit view without a workflow YAML file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-tui-real-"))
    const plainDir = path.join(root, "demo")
    const source = path.join(root, "source")
    createSourceRepo(source)

    execFileSync("bun", [
      "src/cli.ts",
      "project",
      "create",
      plainDir,
      "--repo",
      source,
      "--branch",
      "main",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      stdio: "pipe",
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
      },
    })

    const stdout = execFileSync("bun", [
      "src/cli.ts",
      "tui",
      "--project",
      plainDir,
      "--view",
      "commits",
      "--print",
    ], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AGENTHUB_PROJECTS_JSON: JSON.stringify([{ id: "demo", label: "Demo Project", path: plainDir }]),
      },
    })

    expect(stdout).toContain("Demo Project (demo)")
    expect(stdout).toContain("Commit View")
    expect(stdout).toContain("Initial commit")
    expect(stdout).toContain("worktrees: main clean +0/-0")
  })

})

function runWorkflowView(view: string): string {
  return execFileSync("bun", [
    "src/cli.ts",
    "workflow",
    "--file",
    path.resolve(import.meta.dirname, "../examples/agenthub.workflow.yml"),
    "--view",
    view,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

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
