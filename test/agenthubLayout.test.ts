import { describe, expect, it } from "vitest"

import { parseWorktreePorcelain, safeWorktreeSlug } from "../src/agenthub/worktreeLayout.js"

describe("AgentHub worktree layout utilities", () => {
  it("parses git worktree porcelain output and skips prunable entries", () => {
    const entries = parseWorktreePorcelain([
      "worktree /repo/main",
      "HEAD a1b2c3d4",
      "branch refs/heads/main",
      "",
      "worktree /repo/feature-a",
      "HEAD d4e5f6a7",
      "branch refs/heads/codex/feature-a",
      "",
      "worktree /repo/stale",
      "HEAD deadbeef",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n"))

    expect(entries).toEqual([
      { path: "/repo/main", head: "a1b2c3d4", branch: "main" },
      { path: "/repo/feature-a", head: "d4e5f6a7", branch: "codex/feature-a" },
    ])
  })

  it("accepts simple sibling worktree slugs and rejects unsafe paths", () => {
    expect(safeWorktreeSlug("feature-a")).toBe("feature-a")
    expect(safeWorktreeSlug("benchmark_2026")).toBe("benchmark_2026")

    expect(() => safeWorktreeSlug("../escape")).toThrow("unsafe")
    expect(() => safeWorktreeSlug("nested/path")).toThrow("unsafe")
    expect(() => safeWorktreeSlug("-option")).toThrow("unsafe")
  })
})
