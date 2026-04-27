import net from "node:net"

import { CodexAppServerAdapter } from "../codex/codexAppServerAdapter.js"
import { CodexAppServerSupervisor } from "../codex/appServerSupervisor.js"
import { loadConfig, type BridgeConfig } from "../config/config.js"
import { evaluateSessionPermissionRequest, parsePermissionProfile } from "../runtime/sessionPermissions.js"
import type { PermissionProfile, ProviderKind, SessionAdapter } from "../types.js"

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
    throw new Error("Local approval is required before deploying this agent.")
  }
  if (request.provider !== "codex") {
    throw new Error("AgentHub real deploy currently supports Codex only.")
  }

  const stop = options.adapter ? async () => {} : await ensureCodexAppServer(config)
  try {
    const adapter = options.adapter ?? new CodexAppServerAdapter(
      `ws://${config.codexAppServerHost}:${config.codexAppServerPort}`,
      permission.workspace.path,
      profile,
      config.codexAppServerApprovalPolicy,
    )
    const result = await adapter.startSession(request.prompt)
    const now = options.now?.() ?? new Date().toISOString()
    const provider = displayProvider(request.provider)
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
        message("system", `${provider} ${request.mode} session started through AgentBridge daemon/app-server.`, now),
        message("user", request.prompt, now),
        message("assistant", result.output || "(no output)", now),
      ],
      runs: [{
        id: `run-${result.sessionId}`,
        title: "Real Codex turn",
        command: "codex app-server turn/start",
        state: "completed",
        elapsed: "now",
      }],
      artifacts: [],
      skills: {
        loaded: ["codex-app-server", "agentbridge"],
        suggested: ["frontend-feedback-loop"],
        blocked: [],
        events: [`${now} real Codex session ${result.sessionId} started`],
      },
    }
  } finally {
    await stop()
  }
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

function message(role: "user" | "assistant" | "system", text: string, at: string) {
  return {
    id: `${role}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
    at,
  }
}
