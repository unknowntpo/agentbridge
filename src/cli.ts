import "dotenv/config"

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { AgentBridge } from "./bridge/agentBridge.js"
import { ReplyFormatter } from "./bridge/replyFormatter.js"
import { CodexExecAdapter } from "./codex/codexExecAdapter.js"
import { loadConfig } from "./config/config.js"
import { DiscordGatewayAdapter } from "./discord/discordGatewayAdapter.js"
import { SQLiteStateStore } from "./state/sqliteStateStore.js"

const RUNTIME_DIR = path.join(os.homedir(), ".agentbridge")
const PID_FILE = path.join(RUNTIME_DIR, "agentbridge.pid")

async function main(): Promise<void> {
  acquireProcessLock()

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
      listVisibleThreadMessages: async () => {
        throw new Error("Discord transport not initialized")
      },
      getLatestVisibleThreadMessageId: async () => {
        throw new Error("Discord transport not initialized")
      },
    },
    new ReplyFormatter(config.discordMessageLimit),
  )

  const discord = new DiscordGatewayAdapter(
    config.discordToken,
    config.discordClientId,
    config.discordGuildId,
    bridge,
    config.allowedChannelIds,
  )
  bridge.setDiscordTransport(discord)

  const recovered = bridge.recoverBindings()
  console.info(`Recovered ${recovered.length} thread binding(s)`)

  await discord.start()

  const shutdown = async () => {
    console.info("Shutting down AgentBridge")
    await discord.stop()
    stateStore.close()
    releaseProcessLock()
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
  releaseProcessLock()
  console.error(error)
  process.exit(1)
})

function acquireProcessLock(): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })

  if (fs.existsSync(PID_FILE)) {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim())
    if (Number.isInteger(pid)) {
      try {
        process.kill(pid, 0)
        throw new Error(`AgentBridge is already running with pid ${pid}`)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== "ESRCH") {
          throw error
        }
      }
    }
  }

  fs.writeFileSync(PID_FILE, String(process.pid))
}

function releaseProcessLock(): void {
  if (!fs.existsSync(PID_FILE)) {
    return
  }

  const current = fs.readFileSync(PID_FILE, "utf8").trim()
  if (current === String(process.pid)) {
    fs.rmSync(PID_FILE, { force: true })
  }
}
