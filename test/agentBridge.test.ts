import { describe, expect, it } from "bun:test"

import { AgentBridge } from "../src/bridge/agentBridge.js"
import { ReplyFormatter } from "../src/bridge/replyFormatter.js"
import type { DiscordTransport, PendingApproval, SessionAdapter, StateStore, ThreadBinding } from "../src/types.js"

describe("AgentBridge", () => {
  it("starts a new session from `/codex new <prompt>` and echoes the quoted prompt", async () => {
    const harness = createHarness()

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-1",
      content: "/codex new summarize this repo",
    })

    expect(harness.codex.startCalls).toEqual(["summarize this repo"])
    expect(harness.store.getBinding("thread-123")?.state).toBe("bound_idle")
    expect(harness.discord.messages).toEqual(["> summarize this repo\n\nok"])
  })

  it("ignores `/codex new` inside an already bound thread", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle" }))

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-1",
      content: "/codex new another topic",
    })

    expect(harness.codex.startCalls).toHaveLength(0)
    expect(harness.codex.resumeCalls).toHaveLength(0)
    expect(harness.discord.messages).toHaveLength(0)
  })

  it("resumes a bound session on `/codex chat <prompt>` and tags the user before the quote", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle", lastReadMessageId: "m-1" }))
    harness.discord.transcript = [
      { id: "m-2", authorId: "user-42", authorName: "Eric Chang", isBot: false, content: "發票號碼 12345" },
      { id: "m-3", authorId: "bot-1", authorName: "agentbridge", isBot: true, content: "我看到了" },
    ]
    harness.discord.latestVisibleMessageId = "m-9"

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-2",
      content: "/codex chat continue with the bridge design",
      authorId: "user-42",
    })

    expect(harness.codex.resumeCalls).toEqual([{
      sessionId: "session-7",
      prompt: [
        "Visible thread messages since the last synced point:",
        "[user Eric Chang] 發票號碼 12345",
        "[bot agentbridge] 我看到了",
        "",
        "Current thread prompt: continue with the bridge design",
      ].join("\n"),
    }])
    expect(harness.discord.messages).toEqual(["<@user-42>\n\n> continue with the bridge design\n\nok"])
    expect(harness.store.getBinding("thread-123")?.lastReadMessageId).toBe("m-9")
  })

  it("ignores a plain follow-up message in the thread", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-7", state: "bound_idle" }))

    await harness.bridge.handleMessage({
      threadId: "thread-123",
      messageId: "msg-plain-1",
      content: "also show top 10 dirs",
      authorId: "user-42",
    })

    expect(harness.codex.resumeCalls).toHaveLength(0)
    expect(harness.discord.messages).toHaveLength(0)
  })

  it("resumes a bound session from a mention-routed thread prompt without provider selection", async () => {
    const harness = createHarness()
    harness.store.saveBinding(binding({
      threadId: "thread-123",
      sessionId: "session-g",
      provider: "gemini",
      backend: "cli",
      state: "bound_idle",
      lastReadMessageId: "m-1",
    }))
    harness.discord.transcript = [
      { id: "m-2", authorId: "user-42", authorName: "Eric Chang", isBot: false, content: "先前背景" },
    ]
    harness.discord.latestVisibleMessageId = "m-7"

    await harness.bridge.handleBoundThreadPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "msg-mention-1",
        content: "continue from mention",
        authorId: "user-42",
      },
      "continue from mention",
      harness.discord,
    )

    expect(harness.gemini.resumeCalls).toEqual([{
      sessionId: "session-g",
      prompt: [
        "Visible thread messages since the last synced point:",
        "[user Eric Chang] 先前背景",
        "",
        "Current thread prompt: continue from mention",
      ].join("\n"),
    }])
    expect(harness.discord.messages).toEqual(["<@user-42>\n\n> continue from mention\n\nok-gemini"])
  })

  it("returns setup guidance when a mention arrives in an unbound thread", async () => {
    const harness = createHarness()

    await harness.bridge.handleBoundThreadPromptWithTransport(
      {
        threadId: "thread-unbound",
        messageId: "msg-mention-2",
        content: "help",
        authorId: "user-42",
      },
      "help",
      harness.discord,
    )

    expect(harness.discord.messages[0]).toContain("Use `/codex new <prompt>` or `/gemini new <prompt>`")
  })

  it("rejects `/codex chat` in an unbound thread", async () => {
    const harness = createHarness()

    await harness.bridge.handleMessage({
      threadId: "thread-456",
      messageId: "msg-1",
      content: "/codex chat hello there",
      authorId: "user-9",
    })

    expect(harness.codex.startCalls).toHaveLength(0)
    expect(harness.discord.messages[0]).toContain("Use `/codex new <prompt>`")
  })

  it("rejects overlapping turns for the same thread", async () => {
    const harness = createHarness({ holdStart: true })

    const first = harness.bridge.startFreshPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "msg-2",
        content: "show me disk usage",
        authorId: "user-1",
      },
      "codex",
      "show me disk usage",
      harness.discord,
    )

    await new Promise((resolve) => setImmediate(resolve))

    await harness.bridge.startFreshPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "msg-3",
        content: "another turn",
        authorId: "user-1",
      },
      "codex",
      "another turn",
      harness.discord,
    )

    harness.codex.releaseStart?.()
    await first

    expect(harness.discord.messages.some((message) => message.includes("busy"))).toBe(true)
  })

  it("can start a fresh prompt by replacing an existing binding", async () => {
    const harness = createHarness()
    const slashTransport = new FakeDiscordTransport(false)
    harness.store.saveBinding(binding({ threadId: "thread-123", sessionId: "session-old", state: "bound_idle" }))

    await harness.bridge.startFreshPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "interaction-2",
        content: "what time is it in taiwan?",
        authorId: "user-5",
      },
      "codex",
      "what time is it in taiwan?",
      slashTransport,
    )

    expect(harness.codex.startCalls.at(-1)).toBe("what time is it in taiwan?")
    expect(harness.store.getBinding("thread-123")?.sessionId).toBe("session-1")
    expect(slashTransport.messages).toEqual(["> what time is it in taiwan?\n\nok"])
  })

  it("chunks long replies to the same reply target after the quoted prompt", async () => {
    const harness = createHarness({ output: "a".repeat(4100) })

    await harness.bridge.startFreshPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "interaction-1",
        content: "summarize this repo",
      },
      "codex",
      "summarize this repo",
      harness.discord,
    )

    expect(harness.discord.messages).toHaveLength(4)
    expect(harness.discord.messages[0]).toBe("> summarize this repo")
    expect(harness.discord.messages[1]?.length).toBeLessThanOrEqual(2000)
    expect(harness.discord.threadIds).toEqual(["thread-123", "thread-123", "thread-123", "thread-123"])
  })

  it("surfaces delivery failures and marks binding failed", async () => {
    const harness = createHarness({ failDelivery: true })

    await harness.bridge.startFreshPromptWithTransport(
      {
        threadId: "thread-123",
        messageId: "interaction-1",
        content: "summarize this repo",
      },
      "codex",
      "summarize this repo",
      harness.discord,
    )

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

function createHarness(options?: { output?: string; failDelivery?: boolean; holdResume?: boolean; holdStart?: boolean }) {
  const store = new InMemoryStateStore()
  const discord = new FakeDiscordTransport(options?.failDelivery ?? false)
  const codex = new FakeCodexAdapter(options?.output, options?.holdResume ?? false, options?.holdStart ?? false)
  const gemini = new FakeGeminiAdapter()
  const bridge = new AgentBridge(
    store,
    (provider) => provider === "gemini" ? gemini : codex,
    discord,
    new ReplyFormatter(2000),
    () => "2026-04-23T00:00:00.000Z",
  )
  return { bridge, store, discord, codex, gemini }
}

class InMemoryStateStore implements StateStore {
  private readonly bindings = new Map<string, ThreadBinding>()
  private readonly approvals = new Map<string, PendingApproval>()

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

  getPendingApproval(requestId: string): PendingApproval | null {
    return this.approvals.get(requestId) ?? null
  }

  listPendingApprovals(): PendingApproval[] {
    return [...this.approvals.values()]
  }

  savePendingApproval(approval: PendingApproval): void {
    this.approvals.set(approval.requestId, approval)
  }

  deletePendingApproval(requestId: string): void {
    this.approvals.delete(requestId)
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
  transcript: Array<{ id: string; authorId: string; authorName: string; isBot: boolean; content: string }> = []
  latestVisibleMessageId: string | null = null

  constructor(private readonly failDelivery: boolean) {}

  async sendReply(threadId: string, content: string): Promise<void> {
    if (this.failDelivery) {
      throw new Error("permission denied")
    }

    this.threadIds.push(threadId)
    this.messages.push(content)
  }

  async listVisibleThreadMessages(_threadId: string, afterMessageId?: string | null) {
    if (!afterMessageId) {
      return [...this.transcript]
    }

    const index = this.transcript.findIndex((message) => message.id === afterMessageId)
    return index >= 0 ? this.transcript.slice(index + 1) : [...this.transcript]
  }

  async getLatestVisibleThreadMessageId(_threadId: string): Promise<string | null> {
    return this.latestVisibleMessageId
  }
}

class FakeCodexAdapter implements SessionAdapter {
  readonly provider = "codex" as const
  readonly backendKind = "app-server" as const
  readonly startCalls: string[] = []
  readonly resumeCalls: Array<{ sessionId: string; prompt: string }> = []
  releaseStart?: () => void
  releaseResume?: () => void

  constructor(
    private readonly output = "ok",
    private readonly holdResume = false,
    private readonly holdStart = false,
  ) {}

  async startSession(prompt: string) {
    this.startCalls.push(prompt)

    if (this.holdStart) {
      await new Promise<void>((resolve) => {
        this.releaseStart = resolve
      })
    }

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

class FakeGeminiAdapter implements SessionAdapter {
  readonly provider = "gemini" as const
  readonly backendKind = "cli" as const
  readonly resumeCalls: Array<{ sessionId: string; prompt: string }> = []

  async startSession() {
    return { sessionId: "gemini-session-1", output: "ok-gemini", events: [] }
  }

  async resumeSession(sessionId: string, prompt: string) {
    this.resumeCalls.push({ sessionId, prompt })
    return { sessionId, output: "ok-gemini", events: [] }
  }
}

function binding(overrides: Partial<ThreadBinding>): ThreadBinding {
  return {
    threadId: "thread-1",
    sessionId: "session-1",
    provider: "codex",
    backend: "app-server",
    workspaceId: "agentbridge",
    workspaceLabel: "agentbridge",
    workspacePath: "/repo/agentbridge",
    permissionProfile: "workspace-write",
    state: "bound_idle",
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
    lastError: null,
    lastReadMessageId: null,
    ...overrides,
  }
}
