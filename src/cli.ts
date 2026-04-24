import "dotenv/config"

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { Command } from "commander"

import { AgentBridge } from "./bridge/agentBridge.js"
import { ReplyFormatter } from "./bridge/replyFormatter.js"
import { CodexAppServerAdapter } from "./codex/codexAppServerAdapter.js"
import { AppServerMirrorCoordinator } from "./codex/appServerMirror.js"
import { CodexAppServerSupervisor } from "./codex/appServerSupervisor.js"
import { buildSessionSummary, ensureAgentbridgePromptInstalled, listLocalSessions, loadSessionSnapshot } from "./codex/sessionSummary.js"
import { loadConfig } from "./config/config.js"
import { DiscordGatewayAdapter } from "./discord/discordGatewayAdapter.js"
import { buildThreadName } from "./discord/discordGatewayAdapter.js"
import { DiscordThreadPublisher } from "./discord/discordThreadPublisher.js"
import { GeminiCliAdapter } from "./gemini/geminiCliAdapter.js"
import { attachLocalSession } from "./local/sessionAttach.js"
import { resolveManagedBinding as selectManagedBinding } from "./local/sessionBindingResolver.js"
import { createManagedLocalSession } from "./local/sessionNew.js"
import { openManagedSession } from "./local/sessionOpen.js"
import { evaluateSessionPermissionRequest, parsePermissionProfile } from "./runtime/sessionPermissions.js"
import { SQLiteStateStore } from "./state/sqliteStateStore.js"
import type { PermissionProfile, ProviderKind, SessionAdapter, ThreadBinding } from "./types.js"

const RUNTIME_DIR = path.join(os.homedir(), ".agentbridge")
const PID_FILE = path.join(RUNTIME_DIR, "agentbridge.pid")

interface SessionCommandOptions {
  cwd?: string
  sessionId?: string
  channelId?: string
  mentionUserId?: string
  prompt?: string
  open?: boolean
  latest?: boolean
  provider?: string
  discordThreadId?: string
  workspace?: string
  profile?: string
  ref?: string
}

async function main(): Promise<void> {
  const program = new Command()
    .name("agentbridge")
    .description("Bridge Discord threads and local CLI flows onto an AgentBridge-managed provider runtime.")
    .showHelpAfterError()
    .action(async () => {
      await runDaemon()
    })

  const session = program
    .command("session")
    .description("Manage local AgentBridge session flows.")
    .showHelpAfterError()
    .action(() => {
      session.help()
    })

  session
    .command("list")
    .description("List attachable unmanaged local Codex sessions.")
    .option("--cwd <path>", "Filter sessions by working directory.")
    .action(async (options: SessionCommandOptions) => {
      await runSessionList(options)
    })

  session
    .command("new")
    .description("Start a fresh AgentBridge-managed session directly from local CLI.")
    .requiredOption("--prompt <text>", "Initial prompt for the managed provider session.")
    .option("--provider <provider>", "Provider to use (`codex` or `gemini`).")
    .option("--cwd <path>", "Working directory for the managed session.")
    .option("--workspace <id-or-path>", "Trusted workspace id or absolute path for the session.")
    .option("--profile <profile>", "Permission profile (`workspace-read`, `workspace-write`, or `full-access`).")
    .option("--channel-id <id>", "Discord parent channel for the created thread.")
    .option("--mention-user-id <id>", "Discord user id to mention at the top of the created thread.")
    .option("--no-open", "Create the managed session without launching a local interactive CLI.")
    .action(async (options: SessionCommandOptions) => {
      await runSessionNew(options)
    })

  session
    .command("open")
    .description("Open an existing AgentBridge-managed session in local interactive CLI.")
    .option("--latest", "Open the most recently updated managed binding.")
    .option("--session-id <id>", "Managed session id to open.")
    .option("--discord-thread-id <id>", "Discord thread id whose managed session should be opened.")
    .option("--provider <provider>", "Provider to filter bindings by (`codex` or `gemini`).")
    .option("--cwd <path>", "Working directory for the local CLI session.")
    .action(async (options: SessionCommandOptions) => {
      await runSessionOpen(options)
    })

  session
    .command("attach")
    .description("Bootstrap a managed AgentBridge session from an existing unmanaged local Codex rollout.")
    .option("--cwd <path>", "Working directory to match against the latest unmanaged local session.")
    .option("--session-id <id>", "Explicit unmanaged local session id to attach.")
    .option("--channel-id <id>", "Discord parent channel for the created thread.")
    .option("--mention-user-id <id>", "Discord user id to mention at the top of the created thread.")
    .action(async (options: SessionCommandOptions) => {
      await runSessionAttach(options)
    })

  const approvals = program
    .command("approvals")
    .description("Inspect and approve high-risk Discord session requests.")
    .showHelpAfterError()
    .action(() => {
      approvals.help()
    })

  approvals
    .command("list")
    .description("List pending local approvals for high-risk Discord requests.")
    .action(async () => {
      await runApprovalsList()
    })

  approvals
    .command("approve")
    .description("Approve a pending request by request id.")
    .argument("[requestId]", "Pending approval request id.")
    .option("--ref <ref>", "Approve by the short Discord-visible reference code instead.")
    .action(async (requestId: string | undefined, options: SessionCommandOptions) => {
      await runApprovalsApprove(requestId, options)
    })

  program
    .command("session-summary-thread", { hidden: true })
    .description("Internal one-shot command for publishing a local session summary thread.")
    .option("--cwd <path>")
    .option("--session-id <id>")
    .option("--channel-id <id>")
    .option("--mention-user-id <id>")
    .action(async (options: SessionCommandOptions) => {
      await runSessionSummaryThread(options)
    })

  await program.parseAsync(process.argv)
}

async function runDaemon(): Promise<void> {
  const repoRoot = process.cwd()
  acquireProcessLock()

  const config = loadConfig()
  const appServer = new CodexAppServerSupervisor(
    config.codexCommand,
    config.codexAppServerHost,
    config.codexAppServerPort,
    config.codexArgs,
  )
  await appServer.start()
  const promptPath = ensureAgentbridgePromptInstalled({
    codexHome: config.codexHome,
    repoRoot,
  })
  console.info(`Ensured local Codex prompt at ${promptPath}`)

  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()

  const bridge = new AgentBridge(
    stateStore,
    (provider, contract) => createAdapterForProvider(provider, contract.workspacePath, contract.permissionProfile, config),
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
    stateStore,
    config.trustedWorkspaces,
  )
  bridge.setDiscordTransport(discord)

  const recovered = bridge.recoverBindings()
  console.info(`Recovered ${recovered.length} thread binding(s)`)

  const mirror = new AppServerMirrorCoordinator(
    appServer.serverUrl,
    stateStore,
    discord,
    new ReplyFormatter(config.discordMessageLimit),
  )
  mirror.syncBindings(recovered)
  const mirrorInterval = setInterval(() => {
    mirror.syncBindings(stateStore.listBindings())
  }, 2000)

  await discord.start()

  const shutdown = async () => {
    console.info("Shutting down AgentBridge")
    clearInterval(mirrorInterval)
    await mirror.stop()
    await discord.stop()
    await appServer.stop()
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

async function runSessionSummaryThread(options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  const snapshot = loadSessionSnapshot({
    codexHome: config.codexHome,
    cwd: options.cwd ?? process.cwd(),
    sessionId: options.sessionId,
  })
  const summary = buildSessionSummary(snapshot)
  const parentChannelId = options.channelId ?? config.discordSummaryChannelId ?? config.allowedChannelIds[0] ?? null

  if (!parentChannelId) {
    throw new Error("AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID or AGENTBRIDGE_ALLOWED_CHANNEL_IDS is required for session-summary-thread")
  }

  const mentionUserId = options.mentionUserId ?? config.discordSummaryMentionUserId ?? null
  const body = mentionUserId ? `<@${mentionUserId}>\n\n${summary}` : summary
  const threadName = buildThreadName(`summary ${snapshot.threadName}`)
  const publisher = new DiscordThreadPublisher(config.discordToken)
  const formatter = new ReplyFormatter(config.discordMessageLimit)
  const thread = await publisher.publishThread(parentChannelId, threadName, formatter.chunk(body))

  console.info(`Posted session summary for ${snapshot.sessionId} to ${thread.label}`)
  console.log(JSON.stringify({
    sessionId: snapshot.sessionId,
    threadId: thread.id,
    threadLabel: thread.label,
  }))
}

async function runSessionAttach(options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  const snapshot = loadSessionSnapshot({
    codexHome: config.codexHome,
    cwd: options.cwd ?? process.cwd(),
    sessionId: options.sessionId,
  })
  const parentChannelId = options.channelId ?? config.discordSummaryChannelId ?? config.allowedChannelIds[0] ?? null
  if (!parentChannelId) {
    throw new Error("AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID or AGENTBRIDGE_ALLOWED_CHANNEL_IDS is required for session attach")
  }

  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const appServerUrl = `ws://${config.codexAppServerHost}:${config.codexAppServerPort}`
    const attachResult = await attachLocalSession({
      snapshot,
      parentChannelId,
      mentionUserId: options.mentionUserId ?? config.discordSummaryMentionUserId ?? null,
      adapter: new CodexAppServerAdapter(
        appServerUrl,
        snapshot.cwd,
        "workspace-write",
        config.codexAppServerApprovalPolicy,
      ),
      publisher: new DiscordThreadPublisher(config.discordToken),
      stateStore,
      messageLimit: config.discordMessageLimit,
    })

    console.info(`Attached local Codex session ${attachResult.localSessionId} to managed thread ${attachResult.managedSessionId} and Discord ${attachResult.discordThreadLabel}`)
    console.log(JSON.stringify(attachResult))
  } finally {
    stateStore.close()
  }
}

async function runSessionList(options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  const sessions = listLocalSessions({
    codexHome: config.codexHome,
    cwd: options.cwd,
  })

  if (sessions.length === 0) {
    console.info(`No local Codex sessions found${options.cwd ? ` for cwd ${options.cwd}` : ""}.`)
    console.info("Try again with `agentbridge session list --cwd <path>` or attach with `--session-id <id>`.")
    return
  }

  for (const session of sessions) {
    console.log([
      session.sessionId,
      session.updatedAt || "unknown",
      session.cwd,
      session.threadName,
    ].join("\t"))
  }
}

async function runSessionNew(options: SessionCommandOptions): Promise<void> {
  const prompt = options.prompt?.trim()
  if (!prompt) {
    throw new Error("`agentbridge session new` requires `--prompt <text>`.")
  }

  const config = loadConfig()
  const provider = resolveProvider(options.provider, config.defaultProvider) ?? config.defaultProvider
  const workspaceInput = options.workspace ?? options.cwd ?? process.cwd()
  const profile = parsePermissionProfile(options.profile)
  const permission = evaluateSessionPermissionRequest({
    provider,
    workspaceInput,
    profile,
    trustedWorkspaces: config.trustedWorkspaces,
  })
  if (permission.action === "reject") {
    throw new Error(permission.reason ?? "Unsupported permission request.")
  }

  const cwd = permission.workspace.path
  const parentChannelId = options.channelId ?? config.discordSummaryChannelId ?? config.allowedChannelIds[0] ?? null
  if (!parentChannelId) {
    throw new Error("AGENTBRIDGE_DISCORD_SUMMARY_CHANNEL_ID or AGENTBRIDGE_ALLOWED_CHANNEL_IDS is required for session new")
  }

  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const adapter = createAdapterForProvider(provider, cwd, profile, config)
    const result = await createManagedLocalSession({
      cwd,
      prompt,
      parentChannelId,
      mentionUserId: options.mentionUserId ?? config.discordSummaryMentionUserId ?? null,
      contract: {
        workspaceId: permission.workspace.id,
        workspaceLabel: permission.workspace.label,
        workspacePath: permission.workspace.path,
        permissionProfile: profile,
      },
      adapter,
      publisher: new DiscordThreadPublisher(config.discordToken),
      stateStore,
      messageLimit: config.discordMessageLimit,
    })

    console.info(`Created managed local ${displayProvider(result.provider)} session ${result.managedSessionId} in Discord ${result.discordThreadLabel}`)
    console.log(JSON.stringify(result))

    if (options.open !== false) {
      await openManagedSession(buildOpenOptionsForBinding({
        ...resultToBinding(result),
        updatedAt: new Date().toISOString(),
        state: "bound_idle",
        lastError: null,
        lastReadMessageId: null,
      }, cwd, config))
    }
  } finally {
    stateStore.close()
  }
}

async function runApprovalsList(): Promise<void> {
  const config = loadConfig()
  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const approvals = stateStore.listPendingApprovals()
    if (approvals.length === 0) {
      console.info("No pending local approvals.")
      return
    }

    for (const approval of approvals) {
      console.log(`requestId: ${approval.requestId}`)
      console.log(`ref: ${approval.ref}`)
      console.log(`user: ${approval.requesterDisplayName}`)
      console.log(`provider: ${approval.provider}`)
      console.log(`workspace: ${approval.workspaceLabel}`)
      console.log(`profile: ${approval.permissionProfile}`)
      console.log(`prompt: ${approval.prompt}`)
      console.log(`source: ${approval.source}`)
      console.log("")
    }
  } finally {
    stateStore.close()
  }
}

async function runApprovalsApprove(requestId: string | undefined, options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const approval = options.ref
      ? stateStore.listPendingApprovals().find((candidate) => candidate.ref === options.ref) ?? null
      : requestId
        ? stateStore.getPendingApproval(requestId)
        : null
    if (!approval) {
      if (options.ref) {
        throw new Error(`No pending approval found for ref ${options.ref}`)
      }
      throw new Error("Provide either a request id or `--ref <ref>`.")
    }

    const adapter = createAdapterForProvider(
      approval.provider,
      approval.workspacePath,
      approval.permissionProfile,
      config,
    )
    const result = await createManagedLocalSession({
      cwd: approval.workspacePath,
      prompt: approval.prompt,
      parentChannelId: approval.parentChannelId,
      mentionUserId: approval.requesterUserId,
      contract: {
        workspaceId: approval.workspaceId,
        workspaceLabel: approval.workspaceLabel,
        workspacePath: approval.workspacePath,
        permissionProfile: approval.permissionProfile,
      },
      adapter,
      publisher: new DiscordThreadPublisher(config.discordToken),
      stateStore,
      messageLimit: config.discordMessageLimit,
    })
    stateStore.deletePendingApproval(approval.requestId)

    console.info(`Approved ${approval.requestId} (${approval.ref}) and created managed ${displayProvider(result.provider)} session ${result.managedSessionId} in Discord ${result.discordThreadLabel}`)
    console.log(JSON.stringify({
      requestId: approval.requestId,
      ref: approval.ref,
      prompt: approval.prompt,
      provider: approval.provider,
      discordThreadId: result.discordThreadId,
      discordThreadLabel: result.discordThreadLabel,
      managedSessionId: result.managedSessionId,
    }))
  } finally {
    stateStore.close()
  }
}

async function runSessionOpen(options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const binding = resolveManagedBinding(stateStore, options)
    const cwd = options.cwd ?? process.cwd()
    await openManagedSession(buildOpenOptionsForBinding(binding, cwd, config))
  } finally {
    stateStore.close()
  }
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

function resolveManagedBinding(stateStore: SQLiteStateStore, options: SessionCommandOptions) {
  return selectManagedBinding(stateStore.listBindings(), {
    latest: options.latest,
    sessionId: options.sessionId,
    discordThreadId: options.discordThreadId,
    provider: resolveProvider(options.provider, null),
  })
}

function createAdapterForProvider(
  provider: ProviderKind,
  cwd: string,
  permissionProfile: PermissionProfile,
  config: ReturnType<typeof loadConfig>,
): SessionAdapter {
  if (provider === "gemini") {
    return new GeminiCliAdapter(config.geminiCommand, config.geminiArgs, cwd, permissionProfile)
  }

  return new CodexAppServerAdapter(
    `ws://${config.codexAppServerHost}:${config.codexAppServerPort}`,
    cwd,
    permissionProfile,
    config.codexAppServerApprovalPolicy,
  )
}

function buildOpenOptionsForBinding(
  binding: ThreadBinding,
  cwd: string,
  config: ReturnType<typeof loadConfig>,
) {
  const openCwd = binding.workspacePath || cwd
  if (binding.provider === "gemini") {
    return {
      command: config.geminiCommand,
      args: [...config.geminiArgs, "--resume", binding.sessionId],
      cwd: openCwd,
    }
  }

  return {
    command: config.codexCommand,
    args: [
      ...config.codexArgs,
      "resume",
      binding.sessionId,
      "--remote",
      `ws://${config.codexAppServerHost}:${config.codexAppServerPort}`,
      "--cd",
      openCwd,
    ],
    cwd: openCwd,
  }
}

function resultToBinding(result: Awaited<ReturnType<typeof createManagedLocalSession>>): ThreadBinding {
  return {
    threadId: result.discordThreadId,
    sessionId: result.managedSessionId,
    provider: result.provider,
    backend: result.provider === "gemini" ? "cli" : "app-server",
    workspaceId: result.workspaceId,
    workspaceLabel: result.workspaceLabel,
    workspacePath: result.workspacePath,
    permissionProfile: result.permissionProfile,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: "bound_idle",
    lastError: null,
    lastReadMessageId: null,
  }
}

function resolveProvider(value: string | undefined, fallback: ProviderKind | null): ProviderKind | undefined {
  if (value === "codex" || value === "gemini") {
    return value
  }
  return fallback ?? undefined
}

function displayProvider(provider: ProviderKind): string {
  return provider === "gemini" ? "Gemini" : "Codex"
}
