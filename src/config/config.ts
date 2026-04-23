import os from "node:os"
import path from "node:path"

export interface BridgeConfig {
  sqlitePath: string
  codexCommand: string
  codexArgs: string[]
  discordMessageLimit: number
  discordToken: string
  discordClientId: string
  discordGuildId: string | null
  allowedChannelIds: string[]
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const discordToken = env.DISCORD_TOKEN ?? ""
  if (!discordToken) {
    throw new Error("DISCORD_TOKEN is required")
  }

  return {
    sqlitePath: resolveHomePath(env.AGENTBRIDGE_SQLITE_PATH ?? ".agentbridge/state.db"),
    codexCommand: env.AGENTBRIDGE_CODEX_COMMAND ?? "codex",
    codexArgs: splitArgs(env.AGENTBRIDGE_CODEX_ARGS ?? ""),
    discordMessageLimit: Number(env.AGENTBRIDGE_DISCORD_MESSAGE_LIMIT ?? 2000),
    discordToken,
    discordClientId: env.DISCORD_CLIENT_ID ?? "",
    discordGuildId: env.DISCORD_GUILD_ID ?? null,
    allowedChannelIds: splitCsv(env.AGENTBRIDGE_ALLOWED_CHANNEL_IDS ?? ""),
  }
}

function resolveHomePath(value: string): string {
  if (value === "~") {
    return os.homedir()
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2))
  }

  return value
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitArgs(value: string): string[] {
  return value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean)
}
