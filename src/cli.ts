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
import { appendIssueBinding, loadIssueBindings, updateIssueBindingBranch } from "./agenthub/issueBindings.js"
import { createGitHubIssueWithGh } from "./agenthub/githubIssues.js"
import { createAgentHubProjectServiceFromEnv } from "./agenthub/projectService.js"
import { deriveWorkflowViewModelFromProjectScan } from "./agenthub/projectWorkflow.js"
import { deployAgent as deployAgentHandler, ensureCodexAppServer } from "./agenthub/agentDeploy.js"
import { loadWorkflowFile } from "./agenthub/workflowConfig.js"
import type { WorkflowViewModel } from "./agenthub/workflowConfig.js"
import { attachLocalSession } from "./local/sessionAttach.js"
import { resolveManagedBinding as selectManagedBinding } from "./local/sessionBindingResolver.js"
import { buildSessionOpenCommand } from "./local/handoffCommand.js"
import { createManagedLocalSession } from "./local/sessionNew.js"
import { openManagedSession } from "./local/sessionOpen.js"
import { evaluateSessionPermissionRequest, parsePermissionProfile } from "./runtime/sessionPermissions.js"
import { SQLiteStateStore } from "./state/sqliteStateStore.js"
import { runWorkflowTui } from "./tui/WorkflowTui.js"
import type { WorkflowTuiDeployRequest, WorkflowTuiDeployResult } from "./tui/WorkflowTui.js"
import type { WorkflowTuiCreateIssueRequest, WorkflowTuiCreateIssueResult, WorkflowTuiCreateWorktreeRequest, WorkflowTuiCreateWorktreeResult } from "./tui/WorkflowTui.js"
import { createProjectModelSubscriber } from "./tui/projectModelSubscriber.js"
import { parseWorkflowCliView, renderWorkflowTree, renderWorkflowView } from "./tui/workflowTree.js"
import type { PermissionProfile, ProviderKind, SessionAdapter, ThreadBinding } from "./types.js"

const RUNTIME_DIR = path.join(os.homedir(), ".agentbridge")
const PID_FILE = path.join(RUNTIME_DIR, "agentbridge.pid")

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value]
}

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
  json?: boolean
  path?: string
  repo?: string
  branch?: string
  base?: string
  file?: string
  print?: boolean
  view?: string
  project?: string
  issuesFile?: string
  title?: string
  body?: string
  label?: string[]
  assignee?: string
  worktreeId?: string
  worktreePath?: string
  mode?: string
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

  const project = program
    .command("project")
    .description("Manage AgentHub projects backed by Git worktree containers.")
    .showHelpAfterError()
    .action(() => {
      project.help()
    })

  project
    .command("list")
    .description("List AgentHub projects.")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (options: SessionCommandOptions) => {
      await runProjectList(options)
    })

  project
    .command("scan")
    .description("Scan one AgentHub project and its worktrees.")
    .requiredOption("--path <path>", "Project container or worktree path to scan.")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (options: SessionCommandOptions) => {
      await runProjectScan(options)
    })

  project
    .command("create")
    .description("Create a plain worktree project with main/ as the anchor checkout.")
    .argument("<plainDir>", "Plain project container directory.")
    .requiredOption("--repo <url-or-path>", "Git repository URL or local path.")
    .option("--branch <branch>", "Initial branch to clone.", "main")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (plainDir: string, options: SessionCommandOptions) => {
      await runProjectCreate(plainDir, options)
    })

  const issue = program
    .command("issue")
    .description("Create and bind remote issue tracker work items.")
    .showHelpAfterError()
    .action(() => {
      issue.help()
    })

  issue
    .command("create")
    .description("Create a GitHub issue with gh and append it to .agenthub/issues.json.")
    .requiredOption("--project <path>", "AgentHub project/worktree path.")
    .requiredOption("--title <text>", "GitHub issue title.")
    .option("--body <text>", "GitHub issue body.", "")
    .option("--label <name>", "GitHub label to apply. Repeatable.", collectValues, [])
    .option("--assignee <login>", "GitHub assignee, e.g. @me.", "@me")
    .option("--issues-file <path>", "IssueBinding JSON file to update.")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (options: SessionCommandOptions) => {
      await runIssueCreate(options)
    })

  const agent = program
    .command("agent")
    .description("Deploy and inspect AgentHub provider sessions.")
    .showHelpAfterError()
    .action(() => {
      agent.help()
    })

  agent
    .command("deploy")
    .description("Deploy a provider agent onto one worktree.")
    .requiredOption("--worktree-id <id>", "Frontend/worktree id to attach the session to.")
    .requiredOption("--worktree-path <path>", "Worktree directory used as provider working directory.")
    .requiredOption("--prompt <text>", "Initial task prompt for the agent.")
    .option("--provider <provider>", "Provider to use (`codex` or `gemini`).", "codex")
    .option("--mode <mode>", "Agent mode (`read` or `write`).", "write")
    .option("--profile <profile>", "Permission profile.", "workspace-write")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (options: SessionCommandOptions) => {
      await runAgentDeploy(options)
    })

  const worktree = program
    .command("worktree")
    .description("Manage AgentHub sibling Git worktrees.")
    .showHelpAfterError()
    .action(() => {
      worktree.help()
    })

  worktree
    .command("list")
    .description("List worktrees for a project.")
    .requiredOption("--project <path>", "Project container path.")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (options: SessionCommandOptions) => {
      await runWorktreeList(options)
    })

  worktree
    .command("create")
    .description("Create a sibling worktree under an AgentHub project.")
    .argument("<slug>", "Sibling worktree directory name.")
    .requiredOption("--project <path>", "Project container path.")
    .requiredOption("--branch <branch>", "Branch name for the new worktree.")
    .option("--base <ref>", "Base ref for the new worktree.", "HEAD")
    .option("--json", "Emit machine-readable JSON.")
    .action(async (slug: string, options: SessionCommandOptions) => {
      await runWorktreeCreate(slug, options)
    })

  program
    .command("tui")
    .description("Preview an AgentHub workflow YAML or real Git project in the terminal.")
    .option("--file <path>", "AgentHub workflow YAML file.")
    .option("--project <path>", "AgentHub project/worktree path to scan from real Git state.")
    .option("--issues-file <path>", "Local IssueBinding JSON file for tracked issue work items.")
    .option("--view <view>", "Initial view: task-tree, dependency, ready, agents, commits.", "task-tree")
    .option("--print", "Print a deterministic tree and exit without interactive Ink rendering.")
    .action(async (options: SessionCommandOptions) => {
      await runTui(options)
    })

  program
    .command("workflow")
    .description("Print read-only AgentHub workflow projections from YAML or real Git project state.")
    .option("--file <path>", "AgentHub workflow YAML file.")
    .option("--project <path>", "AgentHub project/worktree path to scan from real Git state.")
    .option("--issues-file <path>", "Local IssueBinding JSON file for tracked issue work items.")
    .option("--view <view>", "View to print: task-tree, dependency, ready, agents, commits.", "task-tree")
    .action(async (options: SessionCommandOptions) => {
      await runWorkflow(options)
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
  requireDiscordConfig(config, "agentbridge daemon")
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
  requireDiscordConfig(config, "agentbridge session-summary-thread")
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

async function runProjectList(options: SessionCommandOptions): Promise<void> {
  const service = createAgentHubProjectServiceFromEnv()
  const projects = service.listProjects()
  if (options.json) {
    writeJson(projects)
    return
  }
  for (const project of projects) {
    console.log(`${project.id}\t${project.label}\t${project.path}`)
  }
}

async function runProjectScan(options: SessionCommandOptions): Promise<void> {
  if (!options.path) {
    throw new Error("`agentbridge project scan` requires `--path <path>`.")
  }
  const service = createAgentHubProjectServiceFromEnv()
  const scan = await service.scanProject(options.path)
  if (options.json) {
    writeJson(scan)
    return
  }
  console.log(`${scan.label}\t${scan.rootPath}`)
  for (const worktree of scan.worktrees) {
    console.log(`${worktree.name}\t${worktree.branch ?? "detached"}\t${worktree.status}\t${worktree.path}`)
  }
}

async function runProjectCreate(plainDir: string, options: SessionCommandOptions): Promise<void> {
  if (!options.repo) {
    throw new Error("`agentbridge project create` requires `--repo <url-or-path>`.")
  }
  const service = createAgentHubProjectServiceFromEnv()
  const outcome = await service.createProject({
    plainDir,
    repo: options.repo,
    branch: options.branch,
  })
  if (options.json) {
    writeJson(outcome)
    return
  }
  console.log(outcome.message)
}

async function runIssueCreate(options: SessionCommandOptions): Promise<void> {
  if (!options.project) {
    throw new Error("`agentbridge issue create` requires `--project <path>`.")
  }
  if (!options.title?.trim()) {
    throw new Error("`agentbridge issue create` requires `--title <text>`.")
  }

  const service = createAgentHubProjectServiceFromEnv()
  const scan = await service.scanProject(options.project)
  const labels = options.label && options.label.length > 0 ? options.label : ["agentbridge"]
  const result = await createGitHubIssueWithGh({
    cwd: scan.anchorPath,
    title: options.title,
    body: options.body,
    labels,
    assignee: options.assignee,
  })
  const issueFile = resolveProjectIssuesFile(scan.rootPath, options.issuesFile)
  await appendIssueBinding(issueFile, {
    id: `github:${result.repo}#${result.number}`,
    provider: "github",
    repo: result.repo,
    number: result.number,
    title: result.title,
    state: "open",
    labels: result.labels,
    assignee: result.assignee,
  })

  if (options.json) {
    writeJson({
      ...result,
      issueFile,
    })
    return
  }
  console.log(`created ${result.repo}#${result.number}: ${result.title}`)
  console.log(`bound in ${issueFile}`)
}

async function runWorktreeList(options: SessionCommandOptions): Promise<void> {
  if (!options.project) {
    throw new Error("`agentbridge worktree list` requires `--project <path>`.")
  }
  const service = createAgentHubProjectServiceFromEnv()
  const scan = await service.scanProject(options.project)
  if (options.json) {
    writeJson(scan.worktrees)
    return
  }
  for (const worktree of scan.worktrees) {
    console.log(`${worktree.name}\t${worktree.branch ?? "detached"}\t${worktree.status}\t${worktree.path}`)
  }
}

async function runWorktreeCreate(slug: string, options: SessionCommandOptions): Promise<void> {
  if (!options.project) {
    throw new Error("`agentbridge worktree create` requires `--project <path>`.")
  }
  if (!options.branch) {
    throw new Error("`agentbridge worktree create` requires `--branch <branch>`.")
  }
  const service = createAgentHubProjectServiceFromEnv()
  const outcome = await service.createWorktree({
    projectPath: options.project,
    slug,
    branch: options.branch,
    base: options.base,
  })
  if (options.json) {
    writeJson(outcome)
    return
  }
  console.log(outcome.message)
}

async function runAgentDeploy(options: SessionCommandOptions): Promise<void> {
  const provider = resolveProvider(options.provider, "codex") ?? "codex"
  const mode = options.mode === "read" ? "read" : "write"
  const prompt = options.prompt?.trim()
  if (!options.worktreeId) {
    throw new Error("`agentbridge agent deploy` requires `--worktree-id <id>`.")
  }
  if (!options.worktreePath) {
    throw new Error("`agentbridge agent deploy` requires `--worktree-path <path>`.")
  }
  if (!prompt) {
    throw new Error("`agentbridge agent deploy` requires `--prompt <text>`.")
  }

  const session = await deployAgentHandler({
    worktreeId: options.worktreeId,
    worktreePath: options.worktreePath,
    provider,
    mode,
    profile: parsePermissionProfile(options.profile),
    prompt,
  })
  if (options.json) {
    writeJson(session)
    return
  }

  console.log(`${session.provider} ${session.mode} session ${session.id}`)
  console.log(session.messages.at(-1)?.text ?? "(no output)")
}

async function runTui(options: SessionCommandOptions): Promise<void> {
  const model = await loadWorkflowModelFromOptions(options, "`agentbridge tui`")
  const view = parseWorkflowCliView(options.view)
  if (options.print || !process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(renderWorkflowView(model, view))
    return
  }

  const subscribeModelUpdates = options.project
    ? createProjectModelSubscriber(options.project, (projectPath) => loadProjectWorkflowModel(projectPath, options.issuesFile))
    : undefined
  await runWorkflowTui(
    model,
    view,
    subscribeModelUpdates,
    createTuiDeployAgentHandler(),
    options.project ? createTuiCreateIssueHandler(options.issuesFile) : undefined,
    options.project ? createTuiCreateWorktreeHandler(options.issuesFile) : undefined,
  )
}

async function runWorkflow(options: SessionCommandOptions): Promise<void> {
  const model = await loadWorkflowModelFromOptions(options, "`agentbridge workflow`")
  console.log(renderWorkflowView(model, parseWorkflowCliView(options.view)))
}

async function loadWorkflowModelFromOptions(options: SessionCommandOptions, commandName: string): Promise<WorkflowViewModel> {
  if (options.file && options.project) {
    throw new Error(`${commandName} accepts either --file or --project, not both.`)
  }
  if (options.file && options.issuesFile) {
    throw new Error(`${commandName} accepts --issues-file only with --project.`)
  }
  if (options.file) {
    return loadWorkflowFile(path.resolve(options.file))
  }
  if (options.project) {
    return loadProjectWorkflowModel(options.project, options.issuesFile)
  }
  throw new Error(`${commandName} requires --file <path> or --project <path>.`)
}

async function loadProjectWorkflowModel(projectPath: string, issuesFile?: string): Promise<WorkflowViewModel> {
  const config = loadConfig()
  const service = createAgentHubProjectServiceFromEnv()
  const stateStore = new SQLiteStateStore(config.sqlitePath)
  stateStore.initialize()
  try {
    const scan = await service.scanProject(projectPath)
    const issueBindings = await loadProjectIssueBindings(scan.rootPath, issuesFile)
    return deriveWorkflowViewModelFromProjectScan(scan, {
      bindings: stateStore.listBindings(),
      issueBindings,
    })
  } finally {
    stateStore.close()
  }
}

async function loadProjectIssueBindings(projectRoot: string, issuesFile?: string) {
  if (issuesFile) {
    return loadIssueBindings(path.resolve(issuesFile))
  }

  const defaultPath = path.join(projectRoot, ".agenthub", "issues.json")
  if (!fs.existsSync(defaultPath)) {
    return undefined
  }
  return loadIssueBindings(defaultPath)
}

function resolveProjectIssuesFile(projectRoot: string, issuesFile?: string): string {
  return issuesFile ? path.resolve(issuesFile) : path.join(projectRoot, ".agenthub", "issues.json")
}

async function runSessionAttach(options: SessionCommandOptions): Promise<void> {
  const config = loadConfig()
  requireDiscordConfig(config, "agentbridge session attach")
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
  requireDiscordConfig(config, "agentbridge session new")
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
  requireDiscordConfig(config, "agentbridge approvals approve")
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
    const stop = binding.provider === "codex" ? await ensureCodexAppServer(config) : async () => {}
    try {
      await openManagedSession(buildOpenOptionsForBinding(binding, cwd, config))
    } finally {
      await stop()
    }
  } finally {
    stateStore.close()
  }
}

function createTuiDeployAgentHandler() {
  return async (request: WorkflowTuiDeployRequest): Promise<WorkflowTuiDeployResult> => {
    const provider: ProviderKind = request.provider
    const profile = parsePermissionProfile(request.profile)
    const session = await deployAgentHandler({
      worktreeId: request.worktreeId,
      worktreePath: request.worktreePath,
      provider,
      mode: request.mode,
      profile,
      prompt: request.prompt,
    })

    const config = loadConfig()
    const now = new Date().toISOString()
    const stateStore = new SQLiteStateStore(config.sqlitePath)
    stateStore.initialize()
    try {
      stateStore.saveBinding({
        threadId: `agenthub:${session.id}`,
        sessionId: session.id,
        provider,
        backend: provider === "codex" ? "app-server" : "cli",
        workspaceId: null,
        workspaceLabel: request.worktreeId,
        workspacePath: session.workingDirectory,
        permissionProfile: profile,
        state: "bound_idle",
        createdAt: now,
        updatedAt: now,
        lastError: null,
        lastReadMessageId: null,
      })
    } finally {
      stateStore.close()
    }

    return {
      sessionId: session.id,
      provider,
      mode: request.mode,
      profile,
      worktreeId: request.worktreeId,
      worktreePath: session.workingDirectory,
      handoffCommand: buildSessionOpenCommand({
        sessionId: session.id,
        provider,
        cwd: session.workingDirectory,
      }),
    }
  }
}

function createTuiCreateIssueHandler(issuesFile?: string) {
  return async (request: WorkflowTuiCreateIssueRequest): Promise<WorkflowTuiCreateIssueResult> => {
    const labels = request.labels.length > 0 ? request.labels : ["agentbridge"]
    const result = await createGitHubIssueWithGh({
      cwd: request.cwd,
      title: request.title,
      body: request.body,
      labels,
      assignee: request.assignee,
      repo: request.repo,
    })
    const issueFile = resolveProjectIssuesFile(request.projectRoot, issuesFile)
    await appendIssueBinding(issueFile, {
      id: `github:${result.repo}#${result.number}`,
      provider: "github",
      repo: result.repo,
      number: result.number,
      title: result.title,
      state: "open",
      labels: result.labels,
      assignee: result.assignee,
    })
    return {
      id: `github:${result.repo}#${result.number}`,
      repo: result.repo,
      number: result.number,
      title: result.title,
      url: result.url,
    }
  }
}

function createTuiCreateWorktreeHandler(issuesFile?: string) {
  return async (request: WorkflowTuiCreateWorktreeRequest): Promise<WorkflowTuiCreateWorktreeResult> => {
    const service = createAgentHubProjectServiceFromEnv()
    await service.createWorktree({
      projectPath: request.projectRoot,
      slug: request.slug,
      branch: request.branch,
      base: request.base,
    })
    const issueFile = resolveProjectIssuesFile(request.projectRoot, issuesFile)
    await updateIssueBindingBranch(issueFile, request.issueId, request.branch)
    return {
      branch: request.branch,
      slug: request.slug,
      path: path.join(request.projectRoot, request.slug),
    }
  }
}

function requireDiscordConfig(config: ReturnType<typeof loadConfig>, commandName: string): void {
  if (!config.discordToken) {
    throw new Error(`${commandName} requires DISCORD_TOKEN. Local-only commands such as session open do not require it.`)
  }
  if (config.allowedChannelIds.length === 0) {
    console.warn("AGENTBRIDGE_ALLOWED_CHANNEL_IDS is empty; Discord commands and mentions will be denied by default.")
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

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}
