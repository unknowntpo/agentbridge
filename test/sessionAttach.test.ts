import { describe, expect, it } from "bun:test"

import { attachLocalSession, buildAttachPrompt, formatQuotedAttachPrompt } from "../src/local/sessionAttach.js"
import type { SessionAdapter, StateStore, ThreadBinding } from "../src/types.js"

describe("sessionAttach", () => {
  it("bootstraps a managed thread, creates a Discord thread, and persists an app-server binding", async () => {
    const adapter = new FakeSessionAdapter()
    const publisher = new FakePublisher()
    const store = new FakeStateStore()

    const result = await attachLocalSession({
      snapshot: {
        sessionId: "local-session-1",
        threadName: "Bridge planning",
        cwd: "/repo/agentbridge",
        updatedAt: "2026-04-23T12:00:00.000Z",
        filePath: "/tmp/rollout.jsonl",
        messages: [
          { role: "user", content: "Need app-server migration", timestamp: null },
          { role: "assistant", content: "I will move Discord onto a managed app-server.", timestamp: null },
        ],
      },
      parentChannelId: "channel-1",
      mentionUserId: "user-42",
      adapter,
      publisher,
      stateStore: store,
      messageLimit: 2000,
      now: () => "2026-04-23T00:00:00.000Z",
    })

    expect(adapter.startCalls).toHaveLength(1)
    expect(adapter.startCalls[0]).toContain("Need app-server migration")
    expect(publisher.calls[0]?.threadName).toContain("attached Bridge planning")
    expect(publisher.calls[0]?.messages[0]).toContain("<@user-42>")
    expect(store.saved[0]?.backend).toBe("app-server")
    expect(store.saved[0]?.sessionId).toBe("thr-managed")
    expect(store.saved[0]?.workspacePath).toBe("/repo/agentbridge")
    expect(store.saved[0]?.permissionProfile).toBe("workspace-write")
    expect(result).toEqual({
      localSessionId: "local-session-1",
      managedSessionId: "thr-managed",
      discordThreadId: "discord-thread-1",
      discordThreadLabel: "<#discord-thread-1>",
    })
  })

  it("renders the stable attach prompt and quoted thread header", () => {
    expect(buildAttachPrompt("summary block")).toContain("summary block")
    expect(formatQuotedAttachPrompt(
      { threadName: "Bridge planning", updatedAt: "2026-04-23T12:00:00.000Z" },
      "user-42",
    )).toContain("<@user-42>")
  })
})

class FakeSessionAdapter implements SessionAdapter {
  readonly provider = "codex" as const
  readonly backendKind = "app-server" as const
  readonly startCalls: string[] = []

  async startSession(prompt: string) {
    this.startCalls.push(prompt)
    return {
      sessionId: "thr-managed",
      output: "Attached and ready.",
      events: [],
    }
  }

  async resumeSession(): Promise<never> {
    throw new Error("not used")
  }
}

class FakePublisher {
  readonly calls: Array<{ parentChannelId: string; threadName: string; messages: string[] }> = []

  async publishThread(parentChannelId: string, threadName: string, messages: string[]) {
    this.calls.push({ parentChannelId, threadName, messages })
    return {
      id: "discord-thread-1",
      label: "<#discord-thread-1>",
    }
  }
}

class FakeStateStore implements Pick<StateStore, "saveBinding"> {
  readonly saved: ThreadBinding[] = []

  saveBinding(binding: ThreadBinding): void {
    this.saved.push(binding)
  }
}
