import { describe, expect, it, vi } from "vitest"

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

  it("creates a new thread for `/codex new` from a parent channel", async () => {
    const bridge = {
      startFreshPromptWithTransport: vi.fn().mockResolvedValue(undefined),
      handleChatPromptWithTransport: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never)

    ;(adapter as unknown as { client: { channels: { fetch: ReturnType<typeof vi.fn> } } }).client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          threads: {
            create: vi.fn().mockResolvedValue({
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
        getString: () => "summarize this repo",
      },
      user: { id: "user-1" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
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
      "summarize this repo",
      expect.any(Object),
    )
  })

  it("ignores `/codex new` inside a thread", async () => {
    const bridge = {
      startFreshPromptWithTransport: vi.fn().mockResolvedValue(undefined),
      handleChatPromptWithTransport: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never)

    const interaction = {
      commandName: "codex",
      channelId: "thread-1",
      channel: { isThread: () => true, parentId: "parent-1" },
      options: {
        getSubcommand: () => "new",
        getString: () => "summarize this repo",
      },
      reply: vi.fn().mockResolvedValue(undefined),
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
      startFreshPromptWithTransport: vi.fn().mockResolvedValue(undefined),
      handleChatPromptWithTransport: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never)

    const interaction = {
      commandName: "codex",
      channelId: "thread-1",
      channel: { isThread: () => true, parentId: "parent-1", toString: () => "<#thread-1>" },
      options: {
        getSubcommand: () => "chat",
        getString: () => "continue",
      },
      user: { id: "user-1" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    }

    await (adapter as unknown as { handleSlashCommand: (interaction: unknown) => Promise<void> }).handleSlashCommand(interaction)

    expect(bridge.handleChatPromptWithTransport).toHaveBeenCalledWith(
      {
        threadId: "thread-1",
        messageId: undefined,
        content: "continue",
        authorId: "user-1",
      },
      "continue",
      expect.any(Object),
    )
  })

  it("does not route plain thread messages into the bridge", async () => {
    const bridge = {
      startFreshPromptWithTransport: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new DiscordGatewayAdapter("token", "client", "guild", bridge as never)

    const message = {
      author: { bot: false, id: "user-1" },
      inGuild: () => true,
      content: "follow-up",
      channel: { type: 11, isThread: () => true, id: "thread-1", parentId: "parent-1" },
    }

    await (adapter as unknown as { handleDiscordMessage: (message: unknown) => Promise<void> }).handleDiscordMessage(message)

    expect(bridge.startFreshPromptWithTransport).not.toHaveBeenCalled()
  })
})
