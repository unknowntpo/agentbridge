import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type MessageCreateOptions,
  type SendableChannels,
} from "discord.js"

export class DiscordThreadPublisher {
  private readonly client: Client

  constructor(private readonly token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    })
  }

  async publishThread(parentChannelId: string, threadName: string, messages: string[]): Promise<{ id: string; label: string }> {
    await this.client.login(this.token)

    try {
      const channel = await this.client.channels.fetch(parentChannelId)
      if (!channel || !channel.isTextBased() || !("threads" in channel)) {
        throw new Error(`Thread parent ${parentChannelId} does not support thread creation`)
      }

      const threadManager = (channel as { threads?: { create: (options: { name: string; type?: ChannelType; reason?: string }) => Promise<{ id: string; toString(): string }> } }).threads
      if (!threadManager || typeof threadManager.create !== "function") {
        throw new Error(`Thread parent ${parentChannelId} does not support thread creation`)
      }

      const thread = await threadManager.create({
        name: threadName,
        type: ChannelType.PublicThread,
        reason: "AgentBridge local session summary",
      })

      for (const message of messages) {
        await this.sendMessage(thread.id, { content: message })
      }

      return { id: thread.id, label: thread.toString() }
    } finally {
      this.client.destroy()
    }
  }

  private async sendMessage(threadId: string, options: MessageCreateOptions): Promise<void> {
    const channel = await this.client.channels.fetch(threadId)
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Reply target ${threadId} is not a text-based channel`)
    }

    await (channel as SendableChannels).send(options)
  }
}

