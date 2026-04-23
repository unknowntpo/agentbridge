import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
  type SendableChannels,
} from "discord.js"

import type { AgentBridge } from "../bridge/agentBridge.js"
import type { BridgeRuntime, DiscordTransport, InboundDiscordMessage } from "../types.js"

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

      void this.handleSlashCommand(interaction)
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
    const channel = await this.client.channels.fetch(threadId)
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Reply target ${threadId} is not a text-based channel`) 
    }

    await (channel as SendableChannels).send(content)
  }

  private async handleDiscordMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild() || !message.content.trim()) {
      return
    }

    if (!isSupportedChannel(message.channel.type)) {
      return
    }

    if (!this.isAllowed(message)) {
      return
    }

    const inbound: InboundDiscordMessage = {
      threadId: message.channel.id,
      messageId: message.id,
      content: message.content.trim(),
    }

    console.info(`[discord] messageCreate channel=${inbound.threadId} message=${inbound.messageId}`)

    await this.bridge.handleMessage(inbound)
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "codex") {
      return
    }

    if (!this.isAllowedLocation(interaction.channelId, interaction.channel?.isThread() ? interaction.channel.parentId : null)) {
      await interaction.reply({
        content: "This channel is not allowed for AgentBridge.",
        ephemeral: true,
      })
      return
    }

    const subcommand = interaction.options.getSubcommand()
    console.info(`[discord] interaction command=/codex ${subcommand} channel=${interaction.channelId}`)

    if (subcommand === "ask") {
      const prompt = interaction.options.getString("prompt", true)
      const transport = createInteractionTransport(interaction)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      await this.bridge.handlePromptWithTransport(
        {
          threadId: interaction.channelId,
          messageId: interaction.id,
          content: prompt,
        },
        prompt,
        transport,
      )
      await interaction.editReply("Submitted to AgentBridge. Reply will appear in this channel.")
      return
    }

    const transport = createInteractionTransport(interaction)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await this.bridge.handleNamedCommandWithTransport(
      interaction.channelId,
      subcommand as "new" | "status" | "reset" | "stop",
      transport,
    )
    await interaction.editReply(`Executed /codex ${subcommand} in this channel.`)
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
            .setName("ask")
            .setDescription("Send a prompt to the bound Codex session, or start one if needed")
            .addStringOption((option) =>
              option.setName("prompt").setDescription("Prompt to send to Codex").setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("new").setDescription("Start a fresh Codex session for this channel or thread"),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("status").setDescription("Show the current Thread Binding status"),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("reset").setDescription("Reset the current Thread Binding and start over"),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("stop").setDescription("Stop the current Thread Binding"),
        )
        .toJSON(),
    ]

    if (this.guildId) {
      await this.rest.put(Routes.applicationGuildCommands(this.clientId, this.guildId), {
        body: commands,
      })
      console.info(`Registered guild slash commands for guild ${this.guildId}`)
      return
    }

    await this.rest.put(Routes.applicationCommands(this.clientId), { body: commands })
    console.info("Registered global slash commands")
  }
}

function createInteractionTransport(interaction: ChatInputCommandInteraction): DiscordTransport {
  let first = true

  return {
    async sendReply(_threadId: string, content: string): Promise<void> {
      if (first) {
        first = false
        await interaction.editReply(content)
        return
      }

      await interaction.followUp({ content, flags: MessageFlags.Ephemeral })
    },
  }
}

function isSupportedChannel(channelType: ChannelType): boolean {
  return (
    channelType === ChannelType.GuildText ||
    channelType === ChannelType.PublicThread ||
    channelType === ChannelType.PrivateThread ||
    channelType === ChannelType.AnnouncementThread
  )
}
