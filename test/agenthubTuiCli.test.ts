import { execFileSync } from "node:child_process"
import path from "node:path"

import { describe, expect, it } from "bun:test"

describe("AgentHub TUI CLI", () => {
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
    expect(stdout).toContain("codex-gh-121 codex write running")
    expect(stdout).toContain("worktree: wt/checkout-retry (agent/gh-121-checkout-retry)")
    expect(stdout).toContain("task: gh-121 Add checkout retry metrics [in_progress]")
    expect(stdout).toContain("deps: gh-120(todo)")
    expect(stdout).toContain("claude-gh-130 claude read idle")
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
