import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageType,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type MessageCreateOptions,
  type SendableChannels,
} from "discord.js"

import type { AgentBridge } from "../bridge/agentBridge.js"
import type { BridgeRuntime, DiscordTransport, InboundDiscordMessage, ThreadTranscriptMessage } from "../types.js"

export class DiscordGatewayAdapter implements DiscordTransport, BridgeRuntime {
  private readonly client: Client
  private readonly allowedChannelIds: Set<string>
  private readonly rest: REST

  constructor(
    private readonly token: string,
    private readonly clientId: string,
    private readonly guildId: string | null,
    private readonly bridge: AgentBridge,
    allowedChannelIds: string[] = [],
  ) {
    this.allowedChannelIds = new Set(allowedChannelIds)
    this.rest = new REST({ version: "10" }).setToken(token)
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    })
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, (client) => {
      console.info(`Discord connected as ${client.user.tag}`)
    })

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleDiscordMessage(message)
    })

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) {
        return
      }

      void this.handleSlashCommand(interaction).catch((error) => {
        console.error(`[discord] slash command failed: ${toErrorMessage(error)}`)
      })
    })

    await this.registerSlashCommands()
    await this.client.login(this.token)
  }

  async stop(): Promise<void> {
    this.client.removeAllListeners()
    this.client.destroy()
  }

  async sendReply(threadId: string, content: string): Promise<void> {
    console.info(`[discord] sendReply channel=${threadId} length=${content.length}`)
    await this.sendMessage(threadId, { content })
  }

  async sendMessage(threadId: string, options: MessageCreateOptions): Promise<void> {
    const channel = await this.client.channels.fetch(threadId)
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Reply target ${threadId} is not a text-based channel`)
    }

    await (channel as SendableChannels).send(options)
  }

  async listVisibleThreadMessages(threadId: string, afterMessageId?: string | null): Promise<ThreadTranscriptMessage[]> {
    const channel = await this.client.channels.fetch(threadId)
    if (!channel || !channel.isTextBased() || !channel.isThread()) {
      throw new Error(`Reply target ${threadId} is not a thread`)
    }

    const messages = await this.fetchMessagesAfter(channel, afterMessageId)
    return messages
      .filter(isVisibleTranscriptMessage)
      .map((message) => ({
        id: message.id,
        authorId: message.author.id,
        authorName: message.member?.displayName ?? message.author.username,
        isBot: message.author.bot,
        content: message.content.trim(),
      }))
  }

  async getLatestVisibleThreadMessageId(threadId: string): Promise<string | null> {
    const channel = await this.client.channels.fetch(threadId)
    if (!channel || !channel.isTextBased() || !channel.isThread()) {
      throw new Error(`Reply target ${threadId} is not a thread`)
    }

    const messages = await channel.messages.fetch({ limit: 100 })
    const latest = [...messages.values()]
      .sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)))
      .filter(isVisibleTranscriptMessage)
      .at(-1)

    return latest?.id ?? null
  }

  private async handleDiscordMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild() || !message.content.trim()) {
      return
    }

    if (!isSupportedChannel(message.channel.type) || !message.channel.isThread()) {
      return
    }

    if (!this.isAllowed(message)) {
      return
    }

    console.info(`[discord] messageCreate channel=${message.channel.id} message=${message.id} ignored`)
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "codex") {
      return
    }

    if (!this.isAllowedLocation(interaction.channelId, interaction.channel?.isThread() ? interaction.channel.parentId : null)) {
      await interaction.reply({
        content: "This channel is not allowed for AgentBridge.",
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const subcommand = interaction.options.getSubcommand()
    const prompt = interaction.options.getString("prompt", true)
    console.info(`[discord] interaction command=/codex ${subcommand} channel=${interaction.channelId}`)

    if (subcommand === "new") {
      if (interaction.channel?.isThread()) {
        await interaction.reply({
          content: "Ignoring `/codex new` inside an existing thread.",
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const thread = await this.createThread(interaction.channelId, prompt)
      const transport = createSlashReplyTransport(this, interaction, thread.label)
      await this.bridge.startFreshPromptWithTransport(
        {
          threadId: thread.id,
          messageId: interaction.id,
          content: prompt,
          authorId: interaction.user.id,
        },
        prompt,
        transport,
      )
      await transport.finishAck("Started a fresh Codex session.")
      return
    }

    if (!interaction.channel?.isThread()) {
      await interaction.reply({
        content: "Use `/codex new <prompt>` from a parent channel first.",
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const transport = createSlashReplyTransport(this, interaction, interaction.channel.toString())
    await this.bridge.handleChatPromptWithTransport(
      {
        threadId: interaction.channelId,
        messageId: interaction.id,
        content: prompt,
        authorId: interaction.user.id,
      },
      prompt,
      transport,
    )
    await transport.finishAck()
  }

  private async createThread(channelId: string, prompt: string): Promise<{ id: string; label: string }> {
    const channel = await this.client.channels.fetch(channelId)
    if (!channel || !channel.isTextBased() || !("threads" in channel)) {
      throw new Error(`Thread parent ${channelId} does not support thread creation`)
    }

    const threadManager = (channel as { threads?: { create: (options: { name: string; type?: ChannelType; reason?: string }) => Promise<{ id: string; toString(): string }> } }).threads
    if (!threadManager || typeof threadManager.create !== "function") {
      throw new Error(`Thread parent ${channelId} does not support thread creation`)
    }

    const thread = await threadManager.create({
      name: buildThreadName(prompt),
      type: ChannelType.PublicThread,
      reason: "AgentBridge /codex new",
    })
    return { id: thread.id, label: thread.toString() }
  }

  private async fetchMessagesAfter(
    channel: Message["channel"],
    afterMessageId?: string | null,
  ): Promise<Message[]> {
    const collected: Message[] = []
    let cursor = afterMessageId ?? null

    while (true) {
      const batch = await channel.messages.fetch(
        cursor
          ? { limit: 100, after: cursor }
          : { limit: 100 },
      )
      const orderedBatch = [...batch.values()].sort((left, right) => compareMessageIds(left.id, right.id))

      if (!cursor) {
        return orderedBatch
      }

      if (orderedBatch.length === 0) {
        break
      }

      collected.push(...orderedBatch)
      if (orderedBatch.length < 100) {
        break
      }

      cursor = orderedBatch.at(-1)?.id ?? cursor
    }

    return collected
  }

  private isAllowed(message: Message): boolean {
    return this.isAllowedLocation(
      message.channel.id,
      message.channel.isThread() ? message.channel.parentId : null,
    )
  }

  private isAllowedLocation(channelId: string, parentId: string | null): boolean {
    if (this.allowedChannelIds.size === 0) {
      return true
    }

    if (this.allowedChannelIds.has(channelId)) {
      return true
    }

    if (parentId) {
      return this.allowedChannelIds.has(parentId)
    }

    return false
  }

  private async registerSlashCommands(): Promise<void> {
    if (!this.clientId) {
      console.warn("Skipping slash command registration because DISCORD_CLIENT_ID is empty")
      return
    }

    const commands = [
      new SlashCommandBuilder()
        .setName("codex")
        .setDescription("Interact with AgentBridge")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("new")
            .setDescription("Create a new Codex thread and start a fresh session")
            .addStringOption((option) =>
              option.setName("prompt").setDescription("Prompt to start the fresh session with").setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("chat")
            .setDescription("Send a prompt to the Codex session bound to this thread")
            .addStringOption((option) =>
              option.setName("prompt").setDescription("Prompt to send to Codex").setRequired(true),
            ),
        )
        .toJSON(),
    ]

    if (this.guildId) {
      await this.rest.put(Routes.applicationGuildCommands(this.clientId, this.guildId), {
        body: commands,
      })
      console.info(`Registered guild slash commands for guild ${this.guildId}`)
      await this.rest.put(Routes.applicationCommands(this.clientId), { body: [] })
      console.info("Cleared global slash commands because guild-scoped registration is enabled")
      return
    }

    await this.rest.put(Routes.applicationCommands(this.clientId), { body: commands })
    console.info("Registered global slash commands")
  }
}

type SlashReplyTransport = DiscordTransport & {
  finishAck(message?: string): Promise<void>
}

function createSlashReplyTransport(
  gateway: DiscordGatewayAdapter,
  interaction: ChatInputCommandInteraction,
  publicReplyLabel: string,
): SlashReplyTransport {
  let firstPrivateReply = true
  let usedPublicChannel = false

  return {
    async sendReply(threadId: string, content: string): Promise<void> {
      if (usedPublicChannel) {
        await gateway.sendReply(threadId, content)
        return
      }

      try {
        await gateway.sendReply(threadId, content)
        usedPublicChannel = true
        return
      } catch (error) {
        console.warn(`[discord] public reply fallback for channel=${threadId}: ${toErrorMessage(error)}`)
      }

      if (firstPrivateReply) {
        firstPrivateReply = false
        await interaction.editReply(content)
        return
      }

      await interaction.followUp({ content, flags: MessageFlags.Ephemeral })
    },
    async listVisibleThreadMessages(threadId: string, afterMessageId?: string | null): Promise<ThreadTranscriptMessage[]> {
      return gateway.listVisibleThreadMessages(threadId, afterMessageId)
    },
    async getLatestVisibleThreadMessageId(threadId: string): Promise<string | null> {
      return gateway.getLatestVisibleThreadMessageId(threadId)
    },
    async finishAck(message = "Submitted to AgentBridge."): Promise<void> {
      if (usedPublicChannel) {
        await interaction.editReply(`${message} Reply posted in ${publicReplyLabel}.`)
        return
      }

      await interaction.editReply(`${message} Reply is visible only to you because the bot cannot post in this channel yet.`)
    },
  }
}

function isVisibleTranscriptMessage(message: Message): boolean {
  if (message.content.trim().length === 0) {
    return false
  }

  return message.type === MessageType.Default || message.type === MessageType.Reply
}

function compareMessageIds(left: string, right: string): number {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  if (leftId < rightId) {
    return -1
  }
  if (leftId > rightId) {
    return 1
  }
  return 0
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function buildThreadName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ")
  const base = trimmed.length > 0 ? trimmed : "codex session"
  const sanitized = base.replace(/[\n\r#:`]/g, " ").trim()
  return sanitized.slice(0, 90)
}

export function truncatePrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ")
  if (normalized.length <= 120) {
    return normalized
  }

  return `${normalized.slice(0, 117)}...`
}

function isSupportedChannel(channelType: ChannelType): boolean {
  return (
    channelType === ChannelType.GuildText ||
    channelType === ChannelType.PublicThread ||
    channelType === ChannelType.PrivateThread ||
    channelType === ChannelType.AnnouncementThread
  )
}
