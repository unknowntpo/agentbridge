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
})
