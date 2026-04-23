import { describe, expect, it } from "vitest"

import { AgentBridge } from "../src/bridge/agentBridge.js"
import { ReplyFormatter } from "../src/bridge/replyFormatter.js"
import type { CodexAdapter, DiscordTransport, StateStore, ThreadBinding } from "../src/types.js"

describe("AgentBridge", () => {
  it("starts a new session from an activation message", async () => {
    const harness = createHarness()
    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-1",
      content: "discord summarize this repo",
    })

    expect(harness.codex.startCalls).toEqual(["summarize this repo"])
    expect(harness.store.getBinding("thread-123")?.state).toBe("bound_idle")
  })

  it("rejects non-activation messages before binding", async () => {
    const harness = createHarness()
    await harness.bridge.handleMessage({
      threadId: "thread-456",
      messageId: "msg-1",
      content: "hello there",
    })

    expect(harness.codex.startCalls).toHaveLength(0)
    expect(harness.discord.messages[0]).toContain("No active Codex session")
  })

  it("resumes a bound session on later turns", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle" }))

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-2",
      content: "continue with the bridge design",
    })

    expect(harness.codex.resumeCalls).toEqual([{ sessionId: "session-7", prompt: "continue with the bridge design" }])
  })

  it("rejects overlapping turns for the same thread", async () => {
    const harness = createHarness({ holdResume: true })
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle" }))

    const first = harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-2",
      content: "continue with the bridge design",
    })

    await new Promise((resolve) => setImmediate(resolve))

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-3",
      content: "another turn",
    })

    harness.codex.releaseResume?.()
    await first

    expect(harness.discord.messages.some((message) => message.includes("busy"))).toBe(true)
  })

  it("supports lifecycle commands", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle" }))

    await harness.bridge.handleMessage({ threadId: "thread-123", messageId: "1", content: "/codex status" })
    await harness.bridge.handleMessage({ threadId: "thread-123", messageId: "2", content: "/codex stop" })

    expect(harness.discord.messages[0]).toContain("thread-123 -> session-7")
    expect(harness.store.getBinding("thread-123")).toBeNull()
  })

  it("chunks long replies to the same reply target", async () => {
    const harness = createHarness({ output: "a".repeat(4100) })
    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-1",
      content: "discord summarize this repo",
    })

    expect(harness.discord.messages).toHaveLength(3)
    expect(harness.discord.threadIds).toEqual(["thread-123", "thread-123", "thread-123"])
  })

  it("surfaces delivery failures and marks binding failed", async () => {
    const harness = createHarness({ failDelivery: true })
    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-1",
      content: "discord summarize this repo",
    })

    expect(harness.store.getBinding("thread-123")?.state).toBe("failed")
    expect(harness.store.getBinding("thread-123")?.lastError).toContain("permission denied")
  })

  it("recovers persisted bindings from the state store", () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-1", sessionId: "session-1", state: "bound_idle" }))
    harness.store.saveBinding(binding({ threadId: "thread-2", sessionId: "session-2", state: "executing" }))

    const recovered = harness.bridge.recoverBindings()
    expect(recovered.find((item) => item.threadId === "thread-1")?.state).toBe("bound_idle")
    expect(recovered.find((item) => item.threadId === "thread-2")?.state).toBe("failed")
  })
})

function createHarness(options?: { output?: string; failDelivery?: boolean; holdResume?: boolean }) {
  const store = new InMemoryStateStore()
  const discord = new FakeDiscordTransport(options?.failDelivery ?? false)
  const codex = new FakeCodexAdapter(options?.output, options?.holdResume ?? false)
  const bridge = new AgentBridge(store, codex, discord, new ReplyFormatter(2000), () => "2026-04-23T00:00:00.000Z")
  return { bridge, store, discord, codex }
}

class InMemoryStateStore implements StateStore {
  private readonly bindings = new Map<string, ThreadBinding>()

  initialize(): void {}
  close(): void {}

  getBinding(threadId: string): ThreadBinding | null {
    return this.bindings.get(threadId) ?? null
  }

  listBindings(): ThreadBinding[] {
    return [...this.bindings.values()]
  }

  saveBinding(binding: ThreadBinding): void {
    this.bindings.set(binding.threadId, binding)
  }

  deleteBinding(threadId: string): void {
    this.bindings.delete(threadId)
  }

  recoverBindings(): ThreadBinding[] {
    for (const [threadId, binding] of this.bindings) {
      if (["starting", "executing", "delivering"].includes(binding.state)) {
        this.bindings.set(threadId, { ...binding, state: "failed", lastError: "Recovered after interrupted bridge execution." })
      }
    }

    return this.listBindings()
  }
}

class FakeDiscordTransport implements DiscordTransport {
  readonly messages: string[] = []
  readonly threadIds: string[] = []

  constructor(private readonly failDelivery: boolean) {}

  async sendReply(threadId: string, content: string): Promise<void> {
    if (this.failDelivery) {
      throw new Error("permission denied")
    }

    this.threadIds.push(threadId)
    this.messages.push(content)
  }
}

class FakeCodexAdapter implements CodexAdapter {
  readonly startCalls: string[] = []
  readonly resumeCalls: Array<{ sessionId: string; prompt: string }> = []
  releaseResume?: () => void

  constructor(
    private readonly output = "ok",
    private readonly holdResume = false,
  ) {}

  async startSession(prompt: string) {
    this.startCalls.push(prompt)
    return { sessionId: "session-1", output: this.output, events: [] }
  }

  async resumeSession(sessionId: string, prompt: string) {
    this.resumeCalls.push({ sessionId, prompt })

    if (this.holdResume) {
      await new Promise<void>((resolve) => {
        this.releaseResume = resolve
      })
    }

    return { sessionId, output: this.output, events: [] }
  }
}

function binding(overrides: Partial<ThreadBinding>): ThreadBinding {
  return {
    threadId: "thread-1",
    sessionId: "session-1",
    state: "bound_idle",
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
    lastError: null,
    ...overrides,
  }
}
