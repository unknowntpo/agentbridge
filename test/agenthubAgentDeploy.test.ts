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
    })).rejects.toThrow(/approval|required|trusted|outside/i)
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
