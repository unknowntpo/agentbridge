import { describe, expect, it } from "bun:test"

import { buildCommitLogRows, commitGraphSvgPath } from "./commit-log.js"
import type { AgentSession, GithubState, WorktreeScan } from "./store.js"

const remote: GithubState = {
  provider: "GitHub",
  auth: "ok",
  pr: null,
  prUrl: null,
  checks: "ok",
  review: "ok",
  message: null,
  mocked: false,
}

const worktrees: WorktreeScan[] = [
  worktree("main", "main", "c0ffee1", "clean"),
  worktree("agent-drawer", "feat/agent-drawer", "d4e5f6a", "clean"),
  worktree("docs-permissions", "docs/permissions", "e7fa89b", "clean"),
  worktree("experiment-cache", "exp/cache", "b1c2d3e", "dirty"),
]

const sessions: AgentSession[] = [
  session("agent-drawer", "Codex", "write"),
  session("agent-drawer", "Gemini", "read"),
  session("docs-permissions", "Claude", "read"),
  session("docs-permissions", "Gemini", "read"),
]

describe("commit log view model", () => {
  it("places branch and HEAD tags beside the commit message", () => {
    const rows = buildCommitLogRows(worktrees, sessions)
    const head = rows[0]!

    expect(head.message).toBe("Add deploy agent drawer")
    expect(head.refs.map((ref) => ref.label)).toEqual(["HEAD", "feat/agent-drawer"])
    expect(head.agents.map((agent) => agent.provider)).toEqual(["Codex", "Gemini"])
  })

  it("models a fork and merge graph with stable lane coordinates", () => {
    const graph = commitGraphSvgPath(7)

    expect(graph.viewBox).toBe("0 0 112 476")
    expect(graph.main).toBe("M 24 0 V 476")
    expect(graph.feature).toBe("M 56 0 V 68 Q 56 102 24 102")
    expect(graph.docs).toBe("M 24 102 V 136 Q 24 170 56 170 V 204 Q 56 238 24 238")
    expect(graph.experiment).toBe("M 24 238 V 272 Q 24 306 88 306 V 340 Q 88 374 24 374")
    expect(graph.points.map((point) => point.y)).toEqual([34, 102, 170, 238, 306, 374, 442])
    expect(graph.points.filter((point) => point.kind === "merge").map((point) => point.y)).toEqual([238, 374])
  })
})

function worktree(name: string, branch: string, head: string, status: string): WorktreeScan {
  return {
    id: name,
    name,
    path: `/repo/agentbridge/${name}`,
    branch,
    upstream: `origin/${branch}`,
    head,
    status,
    ahead: 0,
    behind: 0,
    remote,
  }
}

function session(worktreeId: string, provider: "Codex" | "Gemini" | "Claude", mode: "write" | "read"): AgentSession {
  return {
    id: `${worktreeId}-${provider}-${mode}`,
    worktreeId,
    provider,
    mode,
    profile: mode === "read" ? "workspace-read" : "workspace-write",
    state: "running",
    prompt: "demo",
    workingDirectory: `/repo/agentbridge/${worktreeId}`,
    mocked: true,
    messages: [],
    runs: [],
    artifacts: [],
    skills: { loaded: [], suggested: [], blocked: [], events: [] },
  }
}
