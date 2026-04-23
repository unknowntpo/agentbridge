import { AgentBridge } from "./bridge/agentBridge.js"
import { ReplyFormatter } from "./bridge/replyFormatter.js"
import { CodexExecAdapter } from "./codex/codexExecAdapter.js"
import { loadConfig } from "./config/config.js"
import { DiscordGatewayAdapter } from "./discord/discordGatewayAdapter.js"
import { SQLiteStateStore } from "./state/sqliteStateStore.js"

async function main(): Promise<void> {
  const config = loadConfig()

  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()

  const bridge = new AgentBridge(
    stateStore,
    new CodexExecAdapter(config.codexCommand, config.codexArgs),
    {
      sendReply: async () => {
        throw new Error("Discord transport not initialized")
      },
    },
    new ReplyFormatter(config.discordMessageLimit),
  )

  const discord = new DiscordGatewayAdapter(config.discordToken, bridge, config.allowedChannelIds)
  bridge.setDiscordTransport(discord)

  const recovered = bridge.recoverBindings()
  console.info(`Recovered ${recovered.length} thread binding(s)`)

  await discord.start()

  const shutdown = async () => {
    console.info("Shutting down AgentBridge")
    await discord.stop()
    stateStore.close()
    process.exit(0)
  }

  process.on("SIGINT", () => {
    void shutdown()
  })
  process.on("SIGTERM", () => {
    void shutdown()
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
