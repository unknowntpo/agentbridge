import { describe, expect, it } from "bun:test"

import {
  createInitialState,
  deployAgentFromDraft,
  deployAgent,
  addAgentSession,
  openAgentDrawer,
  lockStateForWorktree,
  normalizeProjectScan,
  resolveApproval,
  selectInitialWorktree,
  sendAgentMessage,
  updateAgentDraft,
  withProjectLoading,
  withRemoteLoading,
  type ProjectScan,
} from "./store.js"

const scan: ProjectScan = {
  id: "minishop",
  label: "minishop demo",
  rootPath: "/Users/unknowntpo/repo/unknowntpo/minishop",
  anchorPath: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
  github: {
    provider: "GitHub",
    auth: "unavailable",
    pr: null,
    prUrl: null,
    checks: "mocked",
    review: "mocked",
    message: "auth invalid",
    mocked: true,
  },
  worktrees: [
    {
      id: "feature",
      name: "feature",
      path: "/Users/unknowntpo/repo/unknowntpo/minishop/feature",
      branch: "feat/demo",
      upstream: null,
      head: "b1c2d3e",
      status: "dirty",
      ahead: 1,
      behind: 0,
      remote: {
        provider: "GitHub",
        auth: "unavailable",
        pr: null,
        prUrl: null,
        checks: "mocked",
        review: "mocked",
        message: "auth invalid",
        mocked: true,
      },
    },
    {
      id: "main",
      name: "main",
      path: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      branch: "main",
      upstream: "origin/main",
      head: "a1b2c3d",
      status: "clean",
      ahead: 0,
      behind: 0,
      remote: {
        provider: "GitHub",
        auth: "unavailable",
        pr: null,
        prUrl: null,
        checks: "mocked",
        review: "mocked",
        message: "auth invalid",
        mocked: true,
      },
    },
  ],
}

describe("AgentHub store", () => {
  it("normalizes project scan and selects main first", () => {
    const normalized = normalizeProjectScan(scan)
    expect(normalized.worktrees[0]?.name).toBe("main")
    expect(selectInitialWorktree(normalized)).toBe("main")
  })

  it("enforces one write agent per worktree", () => {
    const first = deployAgent(createInitialState(), {
      worktreeId: "main",
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      prompt: "work",
    })
    const second = deployAgent(first, {
      worktreeId: "main",
      provider: "Gemini",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      prompt: "also work",
    })
    expect(second.sessions).toHaveLength(1)
    expect(second.approvals).toHaveLength(1)
    expect(lockStateForWorktree(second, "main").state).toBe("approval-required")
  })

  it("allows read-only agents on a write-locked worktree", () => {
    const first = deployAgent(createInitialState(), {
      worktreeId: "main",
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      prompt: "work",
    })
    const second = deployAgent(first, {
      worktreeId: "main",
      provider: "Gemini",
      mode: "read",
      profile: "workspace-read",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      prompt: "review",
    })
    expect(second.sessions).toHaveLength(2)
    expect(lockStateForWorktree(second, "main")).toMatchObject({ state: "write-locked", writer: "Codex" })
  })

  it("creates and resolves approval requests from risky chat", () => {
    const state = deployAgent(createInitialState(), {
      worktreeId: "main",
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      prompt: "work",
    })
    const sessionId = state.selectedSessionId!
    const pending = sendAgentMessage(state, sessionId, "please push and open pr")
    expect(pending.approvals).toHaveLength(1)
    const resolved = resolveApproval(pending, pending.approvals[0]!.id, "approved")
    expect(resolved.approvals[0]?.state).toBe("approved")
    expect(resolved.sessions[0]?.state).toBe("running")
  })

  it("creates an agent draft from selected worktree and deploys from the drawer", () => {
    const state = createInitialState()
    const worktree = scan.worktrees.find((candidate) => candidate.id === "main")!
    const opened = openAgentDrawer(state, worktree)

    expect(opened.agentDrawerOpen).toBe(true)
    expect(opened.agentDraft).toMatchObject({
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: worktree.path,
    })

    const edited = updateAgentDraft(opened, {
      provider: "Gemini",
      mode: "read",
      prompt: "review this worktree",
    })
    expect(edited.agentDraft?.profile).toBe("workspace-read")

    const deployed = deployAgentFromDraft(edited)
    expect(deployed.agentDrawerOpen).toBe(false)
    expect(deployed.sessions[0]).toMatchObject({
      provider: "Gemini",
      mode: "read",
      profile: "workspace-read",
      workingDirectory: worktree.path,
      prompt: "review this worktree",
    })
  })

  it("tracks local scan and remote enrichment loading separately", () => {
    const state = createInitialState()
    expect(withProjectLoading(state, "local-scanning").projectLoading).toBe("local-scanning")

    const enriched = withRemoteLoading(scan, true)
    expect(enriched.worktrees.every((worktree) => worktree.remoteLoading)).toBe(true)
    expect(withRemoteLoading(enriched, false).worktrees.every((worktree) => worktree.remoteLoading === false)).toBe(true)
  })

  it("attaches a real backend-created agent session to the selected worktree", () => {
    const state = createInitialState()
    const next = addAgentSession(state, {
      id: "thread-real",
      worktreeId: "main",
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      state: "running",
      prompt: "work",
      workingDirectory: "/Users/unknowntpo/repo/unknowntpo/minishop/main",
      mocked: false,
      messages: [],
      runs: [],
      artifacts: [],
      skills: {
        loaded: ["codex-app-server"],
        suggested: [],
        blocked: [],
        events: [],
      },
    })

    expect(next.selectedWorktreeId).toBe("main")
    expect(next.selectedSessionId).toBe("thread-real")
    expect(next.agentDrawerOpen).toBe(false)
    expect(next.notice).toMatch(/AgentBridge/)
  })
})
