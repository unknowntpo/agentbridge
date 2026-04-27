import net from "node:net"

import { CodexAppServerAdapter } from "../codex/codexAppServerAdapter.js"
import { CodexAppServerSupervisor } from "../codex/appServerSupervisor.js"
import { loadConfig, type BridgeConfig } from "../config/config.js"
import { GeminiCliAdapter } from "../gemini/geminiCliAdapter.js"
import { evaluateSessionPermissionRequest, parsePermissionProfile } from "../runtime/sessionPermissions.js"
import type { PermissionProfile, ProviderKind, ResolvedWorkspace, SessionAdapter, TrustedWorkspace } from "../types.js"

export interface AgentDeployRequest {
  worktreeId: string
  worktreePath: string
  provider: ProviderKind
  mode: "read" | "write"
  profile: PermissionProfile
  prompt: string
}

export interface AgentDeployResult {
  id: string
  worktreeId: string
  provider: "Codex" | "Gemini"
  mode: "read" | "write"
  profile: PermissionProfile
  state: "running" | "blocked" | "idle"
  prompt: string
  workingDirectory: string
  mocked: boolean
  messages: Array<{
    id: string
    role: "user" | "assistant" | "system"
    text: string
    at: string
  }>
  runs: Array<{
    id: string
    title: string
    command: string
    state: "running" | "completed" | "failed"
    elapsed: string
  }>
  artifacts: Array<{ id: string; name: string; age: string }>
  skills: {
    loaded: string[]
    suggested: string[]
    blocked: string[]
    events: string[]
  }
}

export async function deployAgent(request: AgentDeployRequest, options: {
  config?: BridgeConfig
  adapter?: SessionAdapter
  now?: () => string
} = {}): Promise<AgentDeployResult> {
  const config = options.config ?? loadConfig()
  const profile = parsePermissionProfile(request.profile)
  const permission = evaluateSessionPermissionRequest({
    provider: request.provider,
    workspaceInput: request.worktreePath,
    profile,
    trustedWorkspaces: config.trustedWorkspaces,
  })
  if (permission.action === "reject") {
    throw new Error(permission.reason ?? "Unsupported permission request.")
  }
  if (permission.action === "require_local_approval") {
    throw new Error(formatDeployApprovalRequiredMessage({
      profile,
      workspace: permission.workspace,
      trustedWorkspaces: config.trustedWorkspaces,
    }))
  }
  if (options.adapter && options.adapter.provider !== request.provider) {
    throw new Error(`Injected ${options.adapter.provider} adapter cannot deploy ${request.provider} sessions.`)
  }

  const stop = options.adapter || request.provider !== "codex" ? async () => {} : await ensureCodexAppServer(config)
  try {
    const adapter = options.adapter ?? createProviderAdapter(request.provider, config, permission.workspace.path, profile)
    const result = await adapter.startSession(request.prompt)
    const now = options.now?.() ?? new Date().toISOString()
    const provider = displayProvider(request.provider)
    const backendLabel = adapter.backendKind === "app-server" ? "app-server" : "CLI"
    return {
      id: result.sessionId,
      worktreeId: request.worktreeId,
      provider,
      mode: request.mode,
      profile,
      state: "running",
      prompt: request.prompt,
      workingDirectory: permission.workspace.path,
      mocked: false,
      messages: [
        message("system", `${provider} ${request.mode} session started through AgentBridge daemon/${backendLabel}.`, now),
        message("user", request.prompt, now),
        message("assistant", result.output || "(no output)", now),
      ],
      runs: [{
        id: `run-${result.sessionId}`,
        title: `Real ${provider} turn`,
        command: providerCommand(request.provider, adapter.backendKind),
        state: "completed",
        elapsed: "now",
      }],
      artifacts: [],
      skills: {
        loaded: providerSkills(request.provider),
        suggested: ["frontend-feedback-loop"],
        blocked: [],
        events: [`${now} real ${provider} session ${result.sessionId} started`],
      },
    }
  } finally {
    await stop()
  }
}

function createProviderAdapter(
  provider: ProviderKind,
  config: BridgeConfig,
  cwd: string,
  profile: PermissionProfile,
): SessionAdapter {
  if (provider === "gemini") {
    return new GeminiCliAdapter(config.geminiCommand, config.geminiArgs, cwd, profile)
  }

  return new CodexAppServerAdapter(
    `ws://${config.codexAppServerHost}:${config.codexAppServerPort}`,
    cwd,
    profile,
    config.codexAppServerApprovalPolicy,
  )
}

function formatDeployApprovalRequiredMessage(options: {
  profile: PermissionProfile
  workspace: ResolvedWorkspace
  trustedWorkspaces: TrustedWorkspace[]
}): string {
  const reason = options.workspace.trusted
    ? `permission profile \`${options.profile}\` requires local approval`
    : "worktree path is outside trusted workspace roots"
  const trustedRoots = options.trustedWorkspaces.length === 0
    ? "- none configured"
    : options.trustedWorkspaces.map((workspace) => `- ${workspace.id}: ${workspace.path}`).join("\n")

  return [
    "Local approval is required before deploying this agent.",
    `Reason: ${reason}.`,
    `Worktree path: ${options.workspace.path}`,
    `Permission profile: ${options.profile}`,
    "Trusted workspace roots:",
    trustedRoots,
  ].join("\n")
}

export async function ensureCodexAppServer(config: BridgeConfig): Promise<() => Promise<void>> {
  if (await isPortOpen(config.codexAppServerHost, config.codexAppServerPort)) {
    return async () => {}
  }

  const supervisor = new CodexAppServerSupervisor(
    config.codexCommand,
    config.codexAppServerHost,
    config.codexAppServerPort,
    config.codexArgs,
  )
  await supervisor.start()
  return async () => {
    await supervisor.stop()
  }
}

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

function displayProvider(provider: ProviderKind): "Codex" | "Gemini" {
  return provider === "gemini" ? "Gemini" : "Codex"
}

function providerCommand(provider: ProviderKind, backendKind: SessionAdapter["backendKind"]): string {
  if (provider === "gemini") {
    return "gemini -o json"
  }

  return backendKind === "app-server" ? "codex app-server turn/start" : "codex"
}

function providerSkills(provider: ProviderKind): string[] {
  return provider === "gemini"
    ? ["gemini-cli", "agentbridge"]
    : ["codex-app-server", "agentbridge"]
}

function message(role: "user" | "assistant" | "system", text: string, at: string) {
  return {
    id: `${role}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
    at,
  }
}
