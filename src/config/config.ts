export interface BridgeConfig {
  sqlitePath: string
  codexCommand: string
  codexArgs: string[]
  discordMessageLimit: number
  discordToken: string
  allowedChannelIds: string[]
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const discordToken = env.DISCORD_TOKEN ?? ""
  if (!discordToken) {
    throw new Error("DISCORD_TOKEN is required")
  }

  return {
    sqlitePath: env.AGENTBRIDGE_SQLITE_PATH ?? ".agentbridge/state.db",
    codexCommand: env.AGENTBRIDGE_CODEX_COMMAND ?? "codex",
    codexArgs: splitArgs(env.AGENTBRIDGE_CODEX_ARGS ?? ""),
    discordMessageLimit: Number(env.AGENTBRIDGE_DISCORD_MESSAGE_LIMIT ?? 2000),
    discordToken,
    allowedChannelIds: splitCsv(env.AGENTBRIDGE_ALLOWED_CHANNEL_IDS ?? ""),
  }
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
