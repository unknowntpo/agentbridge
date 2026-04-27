import os from "node:os"
import path from "node:path"

import type { ProviderKind, TrustedWorkspace } from "../types.js"

export interface BridgeConfig {
  sqlitePath: string
  codexCommand: string
  codexArgs: string[]
  geminiCommand: string
  geminiArgs: string[]
  defaultProvider: ProviderKind
  codexHome: string
  codexAppServerHost: string
  codexAppServerPort: number
  codexAppServerApprovalPolicy: "never" | "on-request" | "untrusted" | "on-failure"
  discordMessageLimit: number
  discordToken: string
  discordClientId: string
  discordGuildId: string | null
  allowedChannelIds: string[]
  discordSummaryChannelId: string | null
  discordSummaryMentionUserId: string | null
  trustedWorkspaces: TrustedWorkspace[]
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const discordToken = env.DISCORD_TOKEN ?? ""

  const codexAppServerHost = env.AGENTBRIDGE_CODEX_APP_SERVER_HOST ?? "127.0.0.1"
  if (!isLoopbackHost(codexAppServerHost)) {
    throw new Error(
      "AGENTBRIDGE_CODEX_APP_SERVER_HOST must be a loopback host because AgentBridge uses plain ws:// for codex app-server traffic.",
    )
  }

  const allowedChannelIds = splitCsv(env.AGENTBRIDGE_ALLOWED_CHANNEL_IDS ?? "")

  return {
    sqlitePath: resolveHomePath(env.AGENTBRIDGE_SQLITE_PATH ?? "~/.agentbridge/state.db"),
    codexCommand: env.AGENTBRIDGE_CODEX_COMMAND ?? "codex",
    codexArgs: splitArgs(env.AGENTBRIDGE_CODEX_ARGS ?? ""),
    geminiCommand: env.AGENTBRIDGE_GEMINI_COMMAND ?? "gemini",
    geminiArgs: splitArgs(env.AGENTBRIDGE_GEMINI_ARGS ?? ""),
    defaultProvider: parseProvider(env.AGENTBRIDGE_DEFAULT_PROVIDER),
    codexHome: resolveHomePath(env.AGENTBRIDGE_CODEX_HOME ?? "~/.codex"),
    codexAppServerHost,
    codexAppServerPort: Number(env.AGENTBRIDGE_CODEX_APP_SERVER_PORT ?? 4591),
    codexAppServerApprovalPolicy: parseApprovalPolicy(env.AGENTBRIDGE_CODEX_APP_SERVER_APPROVAL_POLICY),
    discordMessageLimit: Number(env.AGENTBRIDGE_DISCORD_MESSAGE_LIMIT ?? 2000),
    discordToken,
    discordClientId: env.DISCORD_CLIENT_ID ?? "",
    discordGuildId: env.DISCORD_GUILD_ID ?? null,
    allowedChannelIds,
    discordSummaryChannelId: env.AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID ?? null,
    discordSummaryMentionUserId: env.AGENTBRIDGE_DISCORD_SUMMARY_MENTION_USER_ID ?? null,
    trustedWorkspaces: parseTrustedWorkspaces(env.AGENTBRIDGE_TRUSTED_WORKSPACES ?? ""),
  }
}

function parseProvider(value: string | undefined): ProviderKind {
  return value === "gemini" ? "gemini" : "codex"
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

function isLoopbackHost(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

function parseTrustedWorkspaces(value: string): TrustedWorkspace[] {
  return splitCsv(value).map((item) => {
    const separator = item.indexOf(":")
    if (separator <= 0 || separator === item.length - 1) {
      throw new Error(`Invalid AGENTBRIDGE_TRUSTED_WORKSPACES entry: ${item}. Use id:/absolute/path`)
    }

    const id = item.slice(0, separator).trim()
    const workspacePath = resolveHomePath(item.slice(separator + 1).trim())
    if (!id || !workspacePath) {
      throw new Error(`Invalid AGENTBRIDGE_TRUSTED_WORKSPACES entry: ${item}. Use id:/absolute/path`)
    }

    return {
      id,
      label: id,
      path: workspacePath,
    }
  })
}

function parseApprovalPolicy(
  value: string | undefined,
): "never" | "on-request" | "untrusted" | "on-failure" {
  if (value === "on-request" || value === "untrusted" || value === "on-failure") {
    return value
  }

  return "never"
}
