import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type SendableChannels,
} from "discord.js"

import type { AgentBridge } from "../bridge/agentBridge.js"
import type { BridgeRuntime, DiscordTransport, InboundDiscordMessage } from "../types.js"

export class DiscordGatewayAdapter implements DiscordTransport, BridgeRuntime {
  private readonly client: Client
  private readonly allowedChannelIds: Set<string>

  constructor(
    private readonly token: string,
    private readonly bridge: AgentBridge,
    allowedChannelIds: string[] = [],
  ) {
    this.allowedChannelIds = new Set(allowedChannelIds)
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

    await this.client.login(this.token)
  }

  async stop(): Promise<void> {
    this.client.removeAllListeners()
    this.client.destroy()
  }

  async sendReply(threadId: string, content: string): Promise<void> {
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

    await this.bridge.handleMessage(inbound)
  }

  private isAllowed(message: Message): boolean {
    if (this.allowedChannelIds.size === 0) {
      return true
    }

    const channelId = message.channel.id
    if (this.allowedChannelIds.has(channelId)) {
      return true
    }

    if (message.channel.isThread() && message.channel.parentId) {
      return this.allowedChannelIds.has(message.channel.parentId)
    }

    return false
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
