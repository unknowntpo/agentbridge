import { describe, expect, it } from "bun:test"

import { deployAgent } from "../src/agenthub/agentDeploy.js"
import type { BridgeConfig } from "../src/config/config.js"
import type { SessionAdapter } from "../src/types.js"

const config: BridgeConfig = {
  sqlitePath: "/tmp/agentbridge-test/state.db",
  codexCommand: "codex",
  codexArgs: [],
  geminiCommand: "gemini",
  geminiArgs: [],
  defaultProvider: "codex",
  codexHome: "/tmp/codex",
  codexAppServerHost: "127.0.0.1",
  codexAppServerPort: 4591,
  codexAppServerApprovalPolicy: "never",
  discordMessageLimit: 2000,
  discordToken: "test-token",
  discordClientId: "client",
  discordGuildId: null,
  allowedChannelIds: [],
  discordSummaryChannelId: null,
  discordSummaryMentionUserId: null,
  trustedWorkspaces: [{
    id: "repo",
    label: "repo",
    path: "/repo",
  }],
}

describe("AgentHub agent deploy", () => {
  it("returns a frontend session model from a real provider adapter", async () => {
    const adapter = new FakeAdapter()
    const session = await deployAgent({
      worktreeId: "wt-main",
      worktreePath: "/repo/project/main",
      provider: "codex",
      mode: "write",
      profile: "workspace-write",
      prompt: "who are you?",
    }, {
      config,
      adapter,
      now: () => "2026-04-25T00:00:00.000Z",
    })

    expect(adapter.prompts).toEqual(["who are you?"])
    expect(session).toMatchObject({
      id: "thr-real",
      worktreeId: "wt-main",
      provider: "Codex",
      mode: "write",
      profile: "workspace-write",
      workingDirectory: "/repo/project/main",
      mocked: false,
    })
    expect(session.messages.map((message) => message.role)).toEqual(["system", "user", "assistant"])
    expect(session.messages.at(-1)?.text).toBe("real codex output")
    expect(session.runs[0]).toMatchObject({
      title: "Real Codex turn",
      state: "completed",
    })
  })

  it("rejects untrusted worktree paths before launching the provider", async () => {
    await expect(deployAgent({
      worktreeId: "outside",
      worktreePath: "/tmp/outside",
      provider: "codex",
      mode: "write",
      profile: "workspace-write",
      prompt: "work",
    }, {
      config,
      adapter: new FakeAdapter(),
    })).rejects.toThrow([
      "Local approval is required before deploying this agent.",
      "Reason: worktree path is outside trusted workspace roots.",
      "Worktree path: /tmp/outside",
      "Permission profile: workspace-write",
      "Trusted workspace roots:",
      "- repo: /repo",
    ].join("\n"))
  })

  it("deploys Gemini through the selected provider adapter instead of Codex", async () => {
    const adapter = new FakeGeminiAdapter()
    const session = await deployAgent({
      worktreeId: "wt-main",
      worktreePath: "/repo/project/main",
      provider: "gemini",
      mode: "read",
      profile: "workspace-read",
      prompt: "summarize this worktree",
    }, {
      config,
      adapter,
      now: () => "2026-04-25T00:00:00.000Z",
    })

    expect(adapter.prompts).toEqual(["summarize this worktree"])
    expect(session).toMatchObject({
      id: "gemini-real",
      provider: "Gemini",
      mode: "read",
      profile: "workspace-read",
      workingDirectory: "/repo/project/main",
      mocked: false,
    })
    expect(session.messages[0]?.text).toBe("Gemini read session started through AgentBridge daemon/CLI.")
    expect(session.runs[0]).toMatchObject({
      title: "Real Gemini turn",
      command: "gemini -o json",
      state: "completed",
    })
    expect(session.skills.loaded).toEqual(["gemini-cli", "agentbridge"])
  })
})

class FakeAdapter implements SessionAdapter {
  readonly provider = "codex" as const
  readonly backendKind = "app-server" as const
  readonly prompts: string[] = []

  async startSession(prompt: string) {
    this.prompts.push(prompt)
    return {
      sessionId: "thr-real",
      output: "real codex output",
      events: [],
    }
  }

  async resumeSession(): Promise<never> {
    throw new Error("not used")
  }
}

class FakeGeminiAdapter implements SessionAdapter {
  readonly provider = "gemini" as const
  readonly backendKind = "cli" as const
  readonly prompts: string[] = []

  async startSession(prompt: string) {
    this.prompts.push(prompt)
    return {
      sessionId: "gemini-real",
      output: "real gemini output",
      events: [],
    }
  }

  async resumeSession(): Promise<never> {
    throw new Error("not used")
  }
}
