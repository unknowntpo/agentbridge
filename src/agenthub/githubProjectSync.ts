import fs from "node:fs"
import path from "node:path"

import { buildSessionOpenCommand } from "../local/handoffCommand.js"
import type { PermissionProfile, ProviderKind, StateStore, ThreadBinding } from "../types.js"
import type { AgentDeployRequest, AgentDeployResult } from "./agentDeploy.js"
import type { GitHubProjectWorkflowConfig } from "./githubProjectConfig.js"
import type { GitHubProjectClient, GitHubProjectIssueItem } from "./githubProjectGh.js"
import type { IssueBinding } from "./issueBindings.js"
import { loadIssueBindings, updateIssueBinding, upsertIssueBinding } from "./issueBindings.js"
import type { AgentHubProjectService } from "./projectService.js"

export interface GitHubProjectSyncRequest {
  projectRoot: string
  issuesFile: string
  config: GitHubProjectWorkflowConfig
  client: GitHubProjectClient
  projectService: AgentHubProjectService
  stateStore: Pick<StateStore, "listBindings" | "saveBinding">
  deployAgent: (request: AgentDeployRequest) => Promise<AgentDeployResult>
  now?: () => string
}

export interface GitHubProjectSyncResult {
  deployed: GitHubProjectSyncDeployment[]
  skipped: GitHubProjectSyncSkip[]
  updated: GitHubProjectSyncUpdate[]
}

export interface GitHubProjectSyncDeployment {
  issueId: string
  branch: string
  worktreePath: string
  sessionId: string
  handoffCommand: string
}

export interface GitHubProjectSyncSkip {
  issueId: string
  reason: string
}

export interface GitHubProjectSyncUpdate {
  issueId: string
  status: string
  reason: string
}

export async function syncGitHubProjectWorkflow(request: GitHubProjectSyncRequest): Promise<GitHubProjectSyncResult> {
  const result: GitHubProjectSyncResult = { deployed: [], skipped: [], updated: [] }
  const now = request.now?.() ?? new Date().toISOString()
  const bindings = await readBindings(request.issuesFile)
  const items = await request.client.listProjectIssueItems(request.config)
  const statusField = await request.client.loadStatusField(request.config)
  const activeSessionPaths = new Set(request.stateStore.listBindings()
    .filter((binding) => binding.state !== "stopped")
    .map((binding) => normalizePath(binding.workspacePath)))

  for (const item of items) {
    const issueId = issueBindingId(item.issue.repo, item.issue.number)
    const current = bindings.get(issueId)
    const nextBinding = await upsertIssueBinding(request.issuesFile, {
      id: issueId,
      provider: "github",
      repo: item.issue.repo,
      number: item.issue.number,
      title: item.issue.title,
      state: item.issue.state,
      labels: item.issue.labels,
      branch: current?.branch,
      projectItemId: item.itemId,
      projectStatus: item.status,
      worktreePath: current?.worktreePath,
      sessionId: current?.sessionId,
      handoffCommand: current?.handoffCommand,
      handoffCommentedAt: current?.handoffCommentedAt,
      prUrl: current?.prUrl,
      prState: current?.prState,
      lastSyncedAt: now,
    })

    const milestoneStatus = await reconcilePullRequestMilestone(request, item, nextBinding, statusField, result)
    if (milestoneStatus && milestoneStatus !== request.config.github.project.deployStatus) {
      result.skipped.push({ issueId, reason: `moved to ${milestoneStatus}` })
      continue
    }

    if (!isDeployCandidate(item, request.config)) {
      result.skipped.push({ issueId, reason: "not deploy candidate" })
      continue
    }
    const candidateWorktreePath = nextBinding.worktreePath ?? path.join(request.projectRoot, issueSlug(item.issue.number, item.issue.title))
    if (nextBinding.sessionId || activeSessionPaths.has(normalizePath(candidateWorktreePath))) {
      result.skipped.push({ issueId, reason: "already deployed" })
      continue
    }

    const deployment = await deployIssue(request, item, nextBinding, now)
    result.deployed.push(deployment)
  }

  return result
}

export function issueSlug(number: number, title: string): string {
  const words = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "")
  return `${number}-${words || "issue"}`
}

export function issueBranch(number: number, title: string): string {
  return `agent/${issueSlug(number, title)}`
}

function isDeployCandidate(item: GitHubProjectIssueItem, config: GitHubProjectWorkflowConfig): boolean {
  return item.issue.state === "open"
    && item.status === config.github.project.deployStatus
    && item.issue.labels.includes(config.github.labels.deploy)
}

async function deployIssue(
  request: GitHubProjectSyncRequest,
  item: GitHubProjectIssueItem,
  binding: IssueBinding,
  now: string,
): Promise<GitHubProjectSyncDeployment> {
  const slug = issueSlug(item.issue.number, item.issue.title)
  const branch = binding.branch ?? issueBranch(item.issue.number, item.issue.title)
  const worktreePath = binding.worktreePath ?? path.join(request.projectRoot, slug)
  if (!binding.branch || !binding.worktreePath) {
    await updateIssueBinding(request.issuesFile, binding.id, {
      branch,
      worktreePath,
      lastSyncedAt: now,
    })
    if (!fs.existsSync(worktreePath)) {
      await request.projectService.createWorktree({
        projectPath: request.projectRoot,
        slug,
        branch,
        base: "HEAD",
      })
    }
  }

  const profile = request.config.agent.defaultPermission
  const provider = request.config.agent.defaultProvider
  const prompt = buildInitialPrompt(item, branch)
  const session = await request.deployAgent({
    worktreeId: slug,
    worktreePath,
    provider,
    mode: "write",
    profile,
    prompt,
    handoffOnly: provider === "codex",
  })
  saveThreadBinding(request.stateStore, {
    sessionId: session.id,
    provider,
    profile,
    worktreeId: slug,
    worktreePath: session.workingDirectory,
    now,
  })
  const handoffCommand = buildSessionOpenCommand({
    sessionId: session.id,
    provider,
    cwd: session.workingDirectory,
  })
  await updateIssueBinding(request.issuesFile, binding.id, {
    branch,
    worktreePath: session.workingDirectory,
    sessionId: session.id,
    handoffCommand,
    lastSyncedAt: now,
  })
  if (!binding.handoffCommentedAt) {
    await request.client.commentIssue(item.issue.repo, item.issue.number, buildHandoffComment({
      provider,
      profile,
      branch,
      worktreePath: session.workingDirectory,
      sessionId: session.id,
      handoffCommand,
    }))
    await updateIssueBinding(request.issuesFile, binding.id, {
      handoffCommentedAt: now,
      lastSyncedAt: now,
    })
  }
  return {
    issueId: binding.id,
    branch,
    worktreePath: session.workingDirectory,
    sessionId: session.id,
    handoffCommand,
  }
}

async function reconcilePullRequestMilestone(
  request: GitHubProjectSyncRequest,
  item: GitHubProjectIssueItem,
  binding: IssueBinding,
  statusField: Awaited<ReturnType<GitHubProjectClient["loadStatusField"]>>,
  result: GitHubProjectSyncResult,
): Promise<string | null> {
  if (!binding.branch || !statusField) return null
  const pr = await request.client.findPullRequest(item.issue.repo, binding.branch)
  const targetStatus = item.issue.state === "closed" || pr?.merged
    ? request.config.github.project.doneStatus
    : pr
      ? request.config.github.project.reviewStatus
      : null
  if (!targetStatus) return null
  await updateIssueBinding(request.issuesFile, binding.id, {
    projectStatus: targetStatus,
    prUrl: pr?.url ?? binding.prUrl,
    prState: pr?.state ?? binding.prState,
  })
  if (item.status === targetStatus) return targetStatus
  await request.client.updateProjectStatus(item.itemId, targetStatus, statusField)
  result.updated.push({
    issueId: binding.id,
    status: targetStatus,
    reason: pr?.merged || item.issue.state === "closed" ? "done milestone" : "review milestone",
  })
  return targetStatus
}

function buildInitialPrompt(item: GitHubProjectIssueItem, branch: string): string {
  const issueRef = `${item.issue.repo}#${item.issue.number}`
  return [
    `Work on GitHub issue ${issueRef}: ${item.issue.title}`,
    `Branch: ${branch}`,
    "",
    "You are running from AgentBridge after the issue was explicitly labeled for agent work.",
    "This deployment is handoff-only: do not modify files until the user opens this session locally and gives direction.",
    "When the user starts working locally, keep changes scoped to this issue and help them open a PR back to GitHub.",
  ].join("\n")
}

function buildHandoffComment(options: {
  provider: ProviderKind
  profile: PermissionProfile
  branch: string
  worktreePath: string
  sessionId: string
  handoffCommand: string
}): string {
  return [
    `AgentBridge deployed ${displayProvider(options.provider)} for this issue.`,
    "",
    `- Provider: ${displayProvider(options.provider)}`,
    `- Permission: ${options.profile}`,
    `- Worktree: \`${options.worktreePath}\``,
    `- Branch: \`${options.branch}\``,
    `- Session: \`${options.sessionId}\``,
    "",
    "Open locally:",
    "",
    "```bash",
    options.handoffCommand,
    "```",
  ].join("\n")
}

function saveThreadBinding(stateStore: Pick<StateStore, "saveBinding">, options: {
  sessionId: string
  provider: ProviderKind
  profile: PermissionProfile
  worktreeId: string
  worktreePath: string
  now: string
}): void {
  const binding: ThreadBinding = {
    threadId: `agenthub:${options.sessionId}`,
    sessionId: options.sessionId,
    provider: options.provider,
    backend: options.provider === "codex" ? "app-server" : "cli",
    workspaceId: null,
    workspaceLabel: options.worktreeId,
    workspacePath: options.worktreePath,
    permissionProfile: options.profile,
    state: "bound_idle",
    createdAt: options.now,
    updatedAt: options.now,
    lastError: null,
    lastReadMessageId: null,
  }
  stateStore.saveBinding(binding)
}

async function readBindings(filePath: string): Promise<Map<string, IssueBinding>> {
  try {
    const bindings = await loadIssueBindings(filePath)
    return new Map(bindings.map((binding) => [binding.id, binding]))
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Map()
    }
    throw error
  }
}

function issueBindingId(repo: string, number: number): string {
  return `github:${repo}#${number}`
}

function displayProvider(provider: ProviderKind): string {
  return provider === "gemini" ? "Gemini" : "Codex"
}

function normalizePath(inputPath: string): string {
  return path.resolve(inputPath)
}
