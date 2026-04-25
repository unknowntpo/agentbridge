import { describe, expect, it } from "bun:test"

import { createManagedLocalSession, formatQuotedNewPrompt } from "../src/local/sessionNew.js"
import type { SessionAdapter, StateStore, ThreadBinding } from "../src/types.js"

describe("sessionNew", () => {
  it("creates a managed local session, publishes a Discord thread, and persists a binding", async () => {
    const adapter = new FakeSessionAdapter()
    const publisher = new FakePublisher()
    const store = new FakeStateStore()

    const result = await createManagedLocalSession({
      cwd: "/repo/agentbridge",
      prompt: "Summarize the current work and wait for follow-up.",
      parentChannelId: "channel-1",
      mentionUserId: "user-42",
      contract: {
        workspaceId: "agentbridge",
        workspaceLabel: "agentbridge",
        workspacePath: "/repo/agentbridge",
        permissionProfile: "workspace-write",
      },
      adapter,
      publisher,
      stateStore: store,
      messageLimit: 2000,
      now: () => "2026-04-23T00:00:00.000Z",
    })

    expect(adapter.startCalls).toEqual(["Summarize the current work and wait for follow-up."])
    expect(publisher.calls[0]?.threadName).toContain("Summarize the current work")
    expect(publisher.calls[0]?.messages[0]).toBe("<@user-42>\n\n> Summarize the current work and wait for follow-up.")
    expect(store.saved[0]?.sessionId).toBe("thr-managed")
    expect(store.saved[0]?.backend).toBe("app-server")
    expect(store.saved[0]?.workspacePath).toBe("/repo/agentbridge")
    expect(store.saved[0]?.permissionProfile).toBe("workspace-write")
    expect(result).toEqual({
      prompt: "Summarize the current work and wait for follow-up.",
      cwd: "/repo/agentbridge",
      provider: "codex",
      managedSessionId: "thr-managed",
      discordThreadId: "discord-thread-1",
      discordThreadLabel: "<#discord-thread-1>",
      workspaceId: "agentbridge",
      workspaceLabel: "agentbridge",
      workspacePath: "/repo/agentbridge",
      permissionProfile: "workspace-write",
    })
  })

  it("renders the quoted visible prompt for a managed local session", () => {
    expect(formatQuotedNewPrompt("hello", "user-42")).toBe("<@user-42>\n\n> hello")
    expect(formatQuotedNewPrompt("hello", null)).toBe("> hello")
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
      output: "Fresh managed session ready.",
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
