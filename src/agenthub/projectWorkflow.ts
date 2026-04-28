import fs from "node:fs"
import path from "node:path"

import type { ThreadBinding, ThreadBindingState } from "../types.js"
import type { IssueBinding } from "./issueBindings.js"
import type { ProjectScan, WorktreeScan } from "./types.js"
import type { AgentMode, WorkflowAgentConfig, WorkflowProjectView, WorkflowViewModel } from "./workflowConfig.js"

export interface ProjectWorkflowProjectionOptions {
  bindings?: ThreadBinding[]
  issueBindings?: IssueBinding[]
}

export function deriveWorkflowViewModelFromProjectScan(
  scan: ProjectScan,
  options: ProjectWorkflowProjectionOptions = {},
): WorkflowViewModel {
  const commits = scan.commits.map((commit) => {
    const linkedWorktrees = scan.worktrees
      .filter((worktree) => worktree.head === commit.shortHash || commit.hash.startsWith(worktree.head))
      .map(toCommitWorktreeView)

    return {
      id: `commit-${commit.shortHash}`,
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      refs: commit.refs,
      authoredAt: commit.authoredAt,
      authorName: commit.authorName,
      worktrees: linkedWorktrees,
    }
  })

  const commitIds = new Set(commits.map((commit) => commit.id))
  const issueByBranch = new Map(
    (options.issueBindings ?? [])
      .filter((issue) => issue.branch)
      .map((issue) => [issue.branch!, issue]),
  )
  const hasIssueBindings = options.issueBindings !== undefined

  const worktrees = scan.worktrees.map((worktree) => {
    const commitId = `commit-${worktree.head}`
    const issue = worktree.branch ? issueByBranch.get(worktree.branch) : undefined
    return {
      id: worktree.id,
      name: worktree.name,
      path: worktree.path,
      branch: worktree.branch ?? "detached",
      work_item: issue?.id ?? (!hasIssueBindings && commitIds.has(commitId) ? commitId : undefined),
    }
  })
  const worktreeByPath = new Map(worktrees.map((worktree) => [normalizePath(worktree.path), worktree]))
  const agents = projectAgentsFromBindings(options.bindings ?? [], worktreeByPath)

  const workItems = hasIssueBindings
    ? options.issueBindings!.map((issue) => ({
      id: issue.id,
      type: "issue" as const,
      title: issue.title,
      status: issue.state === "closed" ? "done" as const : "todo" as const,
      source: issue.provider,
      external_id: `${issue.repo}#${issue.number}`,
      branch: issue.branch,
      labels: issue.labels,
    }))
    : commits.map((commit) => ({
      id: commit.id,
      type: "ticket" as const,
      title: commit.subject,
      status: "done" as const,
      source: "git",
      external_id: commit.shortHash,
      branch: preferredLocalRef(commit.refs),
    }))

  const project: WorkflowProjectView = {
    id: scan.id,
    name: scan.label,
    root: scan.rootPath,
    repo: { provider: "git", remote: scan.anchorPath },
    workItems: workItems.map((item) => ({
      ...item,
      children: [],
      dependencies: [],
      dependents: [],
      agents: agents.filter((agent) => agent.work_item === item.id),
      worktree: worktrees.find((worktree) => worktree.work_item === item.id) ?? null,
      pullRequest: null,
    })),
    rootItems: [],
    worktrees,
    agents,
    pullRequests: [],
    commits,
    summary: {
      epics: 0,
      issues: workItems.length,
      worktrees: scan.worktrees.length,
      agents: agents.length,
      pullRequests: 0,
      commits: commits.length,
    },
  }
  project.rootItems = project.workItems

  return { projects: [project] }
}

function toCommitWorktreeView(worktree: WorktreeScan) {
  return {
    id: worktree.id,
    name: worktree.name,
    path: worktree.path,
    branch: worktree.branch,
    status: worktree.status,
    ahead: worktree.ahead,
    behind: worktree.behind,
  }
}

function preferredLocalRef(refs: string[]): string | undefined {
  return refs.find((ref) => !ref.startsWith("origin/") && ref !== "HEAD" && !ref.startsWith("tag: "))
}

function projectAgentsFromBindings(
  bindings: ThreadBinding[],
  worktreeByPath: Map<string, { id: string; work_item?: string }>,
): WorkflowAgentConfig[] {
  const agents: WorkflowAgentConfig[] = []
  for (const binding of bindings) {
    if (binding.state === "stopped") continue

    const worktree = worktreeByPath.get(normalizePath(binding.workspacePath))
    if (!worktree) continue

    agents.push({
      id: agentIdFromBinding(binding),
      provider: binding.provider,
      mode: modeFromPermissionProfile(binding.permissionProfile),
      status: agentStatusFromBindingState(binding.state),
      session_id: binding.sessionId,
      profile: binding.permissionProfile,
      worktree: worktree.id,
      work_item: worktree.work_item,
    })
  }
  return agents
}

function agentIdFromBinding(binding: ThreadBinding): string {
  const rawId = binding.threadId.startsWith("agenthub:")
    ? binding.sessionId
    : binding.threadId
  const shortId = rawId.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || "session"
  return `${binding.provider}-${shortId}`
}

function modeFromPermissionProfile(profile: ThreadBinding["permissionProfile"]): AgentMode {
  return profile === "workspace-read" ? "read" : "write"
}

function agentStatusFromBindingState(state: ThreadBindingState): string {
  switch (state) {
    case "starting":
      return "starting"
    case "bound_idle":
      return "idle"
    case "executing":
      return "running"
    case "delivering":
      return "syncing"
    case "failed":
      return "failed"
    case "stopped":
      return "stopped"
  }
}

function normalizePath(inputPath: string): string {
  const resolved = path.resolve(inputPath)
  return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
}
