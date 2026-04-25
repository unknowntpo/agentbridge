import { describe, expect, it, mock } from "bun:test"

import { buildThreadName, DiscordGatewayAdapter, truncatePrompt } from "../src/discord/discordGatewayAdapter.js"

describe("discordGatewayAdapter helpers", () => {
  it("keeps short prompts unchanged", () => {
    expect(truncatePrompt("summarize this repo")).toBe("summarize this repo")
  })

  it("truncates long prompts for status text", () => {
    const result = truncatePrompt("a".repeat(140))
    expect(result).toHaveLength(120)
    expect(result.endsWith("...")).toBe(true)
  })

  it("builds a safe thread name", () => {
    expect(buildThreadName("  summarize:\nthis repo  ")).toBe("summarize  this repo")
  })

  it("falls back when a thread name sanitizes to empty", () => {
    expect(buildThreadName("#:`")).toBe("agentbridge session")
  })

  it("creates a new thread for `/codex new` from a parent channel", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleChatPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["channel-1"], undefined, [
      { id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" },
    ])

    ;(adapter as unknown as { client: { channels: { fetch: ReturnType<typeof mock> } } }).client = {
      channels: {
        fetch: mock().mockResolvedValue({
          isTextBased: () => true,
          threads: {
            create: mock().mockResolvedValue({
              id: "thread-1",
              toString: () => "<#thread-1>",
            }),
          },
        }),
      },
    }

    const interaction = {
      commandName: "codex",
      channelId: "channel-1",
      channel: { isThread: () => false, parentId: null },
      options: {
        getSubcommand: () => "new",
        getString: (name: string) => {
          if (name === "prompt") return "summarize this repo"
          if (name === "workspace") return "agentbridge"
          if (name === "profile") return "workspace-write"
          return null
        },
      },
      user: { id: "user-1" },
      deferReply: mock().mockResolvedValue(undefined),
      editReply: mock().mockResolvedValue(undefined),
      reply: mock().mockResolvedValue(undefined),
      followUp: mock().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(bridge.startFreshPromptWithTransport).toHaveBeenCalledTimes(1)
    expect(bridge.startFreshPromptWithTransport).toHaveBeenCalledWith(
      {
        threadId: "thread-1",
        messageId: undefined,
        content: "summarize this repo",
        authorId: "user-1",
      },
      "codex",
      "summarize this repo",
      expect.any(Object),
      {
        workspaceId: "agentbridge",
        workspaceLabel: "agentbridge",
        workspacePath: "/repo/agentbridge",
        permissionProfile: "workspace-write",
      },
    )
  })

  it("ignores `/codex new` inside a thread", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleChatPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["parent-1"])

    const interaction = {
      commandName: "codex",
      channelId: "thread-1",
      channel: { isThread: () => true, parentId: "parent-1" },
      options: {
        getSubcommand: () => "new",
        getString: (name: string) => {
          if (name === "prompt") return "summarize this repo"
          if (name === "workspace") return "/repo/agentbridge"
          if (name === "profile") return "workspace-write"
          return null
        },
      },
      reply: mock().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(bridge.startFreshPromptWithTransport).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Ignoring `/codex new`"),
      }),
    )
  })

  it("routes `/codex chat` inside a thread to the bridge", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleChatPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["parent-1"])

    const interaction = {
      commandName: "codex",
      channelId: "thread-1",
      channel: { isThread: () => true, parentId: "parent-1", toString: () => "<#thread-1>" },
      options: {
        getSubcommand: () => "chat",
        getString: () => "continue",
      },
      user: { id: "user-1" },
      deferReply: mock().mockResolvedValue(undefined),
      editReply: mock().mockResolvedValue(undefined),
      reply: mock().mockResolvedValue(undefined),
      followUp: mock().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(bridge.handleChatPromptWithTransport).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Continue this thread by mentioning the bot"),
      }),
    )
  })

  it("routes `@bot ...` inside a thread to the bridge", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleBoundThreadPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["parent-1"])
    ;(adapter as unknown as { client: { user: { id: string } } }).client = {
      user: { id: "bot-1" },
    }

    const message = {
      author: { bot: false, id: "user-1" },
      inGuild: () => true,
      content: "<@bot-1> continue with gemini",
      id: "msg-1",
      react: mock().mockResolvedValue(undefined),
      channel: { type: 11, isThread: () => true, id: "thread-1", parentId: "parent-1" },
    }

    await (adapter as unknown as { handleDiscordMessage: (message: unknown) => Promise<void> }).handleDiscordMessage(message)

    expect(bridge.handleBoundThreadPromptWithTransport).toHaveBeenCalledWith(
      {
        threadId: "thread-1",
        messageId: "msg-1",
        content: "continue with gemini",
        authorId: "user-1",
      },
      "continue with gemini",
      expect.any(DiscordGatewayAdapter),
    )
    expect(message.react).toHaveBeenCalledWith("👍")
  })

  it("queues high-risk `/codex new` requests for local approval", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleBoundThreadPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const stateStore = {
      savePendingApproval: mock(),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["channel-1"], stateStore as never, [
      { id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" },
    ])

    const interaction = {
      commandName: "codex",
      channelId: "channel-1",
      channel: { isThread: () => false, parentId: null },
      options: {
        getSubcommand: () => "new",
        getString: (name: string) => {
          if (name === "prompt") return "inspect filesystem"
          if (name === "workspace") return "/"
          if (name === "profile") return "workspace-write"
          return null
        },
      },
      user: { id: "user-1", username: "Eric", globalName: "Eric Chang" },
      reply: mock().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(stateStore.savePendingApproval).toHaveBeenCalledTimes(1)
    expect(bridge.startFreshPromptWithTransport).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Ref:"),
      }),
    )
  })

  it("does not route plain thread messages into the bridge", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleBoundThreadPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, ["parent-1"])
    ;(adapter as unknown as { client: { user: { id: string } } }).client = {
      user: { id: "bot-1" },
    }

    const message = {
      author: { bot: false, id: "user-1" },
      inGuild: () => true,
      content: "follow-up",
      react: mock().mockResolvedValue(undefined),
      channel: { type: 11, isThread: () => true, id: "thread-1", parentId: "parent-1" },
    }

    await (adapter as unknown as { handleDiscordMessage: (message: unknown) => Promise<void> }).handleDiscordMessage(message)

    expect(bridge.startFreshPromptWithTransport).not.toHaveBeenCalled()
    expect(bridge.handleBoundThreadPromptWithTransport).not.toHaveBeenCalled()
    expect(message.react).not.toHaveBeenCalled()
  })

  it("denies discord traffic when no allowed channels are configured", async () => {
    const bridge = {
      startFreshPromptWithTransport: mock().mockResolvedValue(undefined),
      handleBoundThreadPromptWithTransport: mock().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never, [], undefined, [
      { id: "agentbridge", label: "agentbridge", path: "/repo/agentbridge" },
    ])

    const interaction = {
      commandName: "codex",
      channelId: "channel-1",
      channel: { isThread: () => false, parentId: null },
      options: {
        getSubcommand: () => "new",
        getString: (name: string) => {
          if (name === "prompt") return "summarize this repo"
          if (name === "workspace") return "agentbridge"
          if (name === "profile") return "workspace-write"
          return null
        },
      },
      user: { id: "user-1" },
      reply: mock().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(bridge.startFreshPromptWithTransport).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "This channel is not allowed for AgentBridge.",
      }),
    )
  })

  it("sorts latest visible message ids without lossy number conversion", async () => {
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", {} as never, ["parent-1"])
    ;(adapter as unknown as { client: { channels: { fetch: ReturnType<typeof mock> } } }).client = {
      channels: {
        fetch: mock().mockResolvedValue({
          isTextBased: () => true,
          isThread: () => true,
          messages: {
            fetch: mock().mockResolvedValue(new Map([
              ["9223372036854775808", visibleMessage("9223372036854775808", "older")],
              ["9223372036854775810", visibleMessage("9223372036854775810", "newer")],
              ["9223372036854775809", visibleMessage("9223372036854775809", "middle")],
            ])),
          },
        }),
      },
    }

    await expect(adapter.getLatestVisibleThreadMessageId("thread-1")).resolves.toBe("9223372036854775810")
  })

  it("paginates initial visible thread message fetches", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => {
      const id = String(200 + index)
      return visibleMessage(id, index === 0 ? "middle" : `message ${id}`)
    })
    const secondPage = [
      visibleMessage("100", "oldest"),
    ]
    const fetch = mock()
      .mockResolvedValueOnce(new Map(firstPage.map((message) => [message.id, message])))
      .mockResolvedValueOnce(new Map(secondPage.map((message) => [message.id, message])))

    const adapter = new DiscordGatewayAdapter("token", "client", "guild", {} as never, ["parent-1"])
    ;(adapter as unknown as { client: { channels: { fetch: ReturnType<typeof mock> } } }).client = {
      channels: {
        fetch: mock().mockResolvedValue({
          isTextBased: () => true,
          isThread: () => true,
          messages: { fetch },
        }),
      },
    }

    const messages = await adapter.listVisibleThreadMessages("thread-1")
    expect(messages).toHaveLength(101)
    expect(messages.at(0)).toEqual(expect.objectContaining({ id: "100", content: "oldest" }))
    expect(messages.at(1)).toEqual(expect.objectContaining({ id: "200", content: "middle" }))
    expect(messages.at(-1)).toEqual(expect.objectContaining({ id: "299", content: "message 299" }))
    expect(fetch).toHaveBeenCalledWith({ limit: 100 })
    expect(fetch).toHaveBeenCalledWith({ limit: 100, before: "200" })
  })
})

function visibleMessage(id: string, content: string): { id: string; content: string } {
  return {
    id,
    content,
    type: 0,
    system: false,
    author: { id: `author-${id}`, username: `author-${id}`, bot: false },
    member: null,
  } as never
}
