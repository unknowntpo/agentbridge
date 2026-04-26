import fs from "node:fs/promises"

import { parse } from "yaml"

export type WorkItemType = "epic" | "issue" | "ticket"
export type WorkItemStatus = "todo" | "in_progress" | "review" | "done" | "blocked"
export type AgentProvider = "codex" | "gemini" | "claude" | "openai"
export type AgentMode = "read" | "write"

export interface WorkflowConfig {
  version: 1
  projects: WorkflowProjectConfig[]
}

export interface WorkflowProjectConfig {
  id: string
  name: string
  root?: string
  repo?: {
    provider?: string
    owner?: string
    name?: string
    remote?: string
  }
  work_items?: WorkflowWorkItemConfig[]
  worktrees?: WorkflowWorktreeConfig[]
  agents?: WorkflowAgentConfig[]
  pull_requests?: WorkflowPullRequestConfig[]
}

export interface WorkflowWorkItemConfig {
  id: string
  type: WorkItemType
  title: string
  status: WorkItemStatus
  source?: string
  external_id?: string
  priority?: string
  branch?: string
  labels?: string[]
  children?: string[]
}

export interface WorkflowWorktreeConfig {
  id: string
  name: string
  path: string
  branch: string
  work_item?: string
}

export interface WorkflowAgentConfig {
  id: string
  provider: AgentProvider
  mode: AgentMode
  status: string
  profile?: string
  worktree: string
  work_item?: string
}

export interface WorkflowPullRequestConfig {
  id: string
  work_item: string
  url?: string
  status: string
  checks?: string
}

export interface WorkflowViewModel {
  projects: WorkflowProjectView[]
}

export interface WorkflowProjectView {
  id: string
  name: string
  root?: string
  repo?: WorkflowProjectConfig["repo"]
  workItems: WorkflowWorkItemView[]
  rootItems: WorkflowWorkItemView[]
  worktrees: WorkflowWorktreeConfig[]
  agents: WorkflowAgentConfig[]
  pullRequests: WorkflowPullRequestConfig[]
  summary: {
    epics: number
    issues: number
    worktrees: number
    agents: number
    pullRequests: number
  }
}

export interface WorkflowWorkItemView extends Omit<WorkflowWorkItemConfig, "children"> {
  children: WorkflowWorkItemView[]
  agents: WorkflowAgentConfig[]
  worktree: WorkflowWorktreeConfig | null
  pullRequest: WorkflowPullRequestConfig | null
}

export async function loadWorkflowFile(filePath: string): Promise<WorkflowViewModel> {
  const source = await fs.readFile(filePath, "utf8")
  return deriveWorkflowViewModel(parseWorkflowConfig(source))
}

export function parseWorkflowConfig(source: string): WorkflowConfig {
  const value = parse(source) as unknown
  if (!isRecord(value)) {
    throw new Error("workflow config must be an object")
  }
  if (value.version !== 1) {
    throw new Error("workflow config version must be 1")
  }
  if (!Array.isArray(value.projects) || value.projects.length === 0) {
    throw new Error("workflow config must contain at least one project")
  }

  return {
    version: 1,
    projects: value.projects.map((project, index) => parseProject(project, `projects[${index}]`)),
  }
}

export function deriveWorkflowViewModel(config: WorkflowConfig): WorkflowViewModel {
  return {
    projects: config.projects.map(deriveProjectView),
  }
}

function deriveProjectView(project: WorkflowProjectConfig): WorkflowProjectView {
  const workItems = project.work_items ?? []
  const worktrees = project.worktrees ?? []
  const agents = project.agents ?? []
  const pullRequests = project.pull_requests ?? []

  assertUnique(workItems.map((item) => item.id), `project ${project.id} work_items`)
  assertUnique(worktrees.map((worktree) => worktree.id), `project ${project.id} worktrees`)
  assertUnique(agents.map((agent) => agent.id), `project ${project.id} agents`)
  assertUnique(pullRequests.map((pullRequest) => pullRequest.id), `project ${project.id} pull_requests`)

  const workItemById = new Map(workItems.map((item) => [item.id, item]))
  const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
  const childIds = new Set<string>()

  for (const item of workItems) {
    for (const childId of item.children ?? []) {
      if (!workItemById.has(childId)) {
        throw new Error(`work item \`${item.id}\` references unknown child \`${childId}\``)
      }
      childIds.add(childId)
    }
  }

  for (const worktree of worktrees) {
    if (worktree.work_item && !workItemById.has(worktree.work_item)) {
      throw new Error(`worktree \`${worktree.id}\` references unknown work item \`${worktree.work_item}\``)
    }
  }

  for (const agent of agents) {
    if (!worktreeById.has(agent.worktree)) {
      throw new Error(`agent \`${agent.id}\` references unknown worktree \`${agent.worktree}\``)
    }
    if (agent.work_item && !workItemById.has(agent.work_item)) {
      throw new Error(`agent \`${agent.id}\` references unknown work item \`${agent.work_item}\``)
    }
  }

  for (const pullRequest of pullRequests) {
    if (!workItemById.has(pullRequest.work_item)) {
      throw new Error(`pull request \`${pullRequest.id}\` references unknown work item \`${pullRequest.work_item}\``)
    }
  }

  const buildItem = (item: WorkflowWorkItemConfig): WorkflowWorkItemView => {
    const linkedAgents = agents.filter((agent) => agent.work_item === item.id)
    const linkedWorktree = worktrees.find((worktree) => worktree.work_item === item.id) ?? null
    const linkedPullRequest = pullRequests.find((pullRequest) => pullRequest.work_item === item.id) ?? null
    return {
      ...item,
      children: (item.children ?? []).map((childId) => buildItem(workItemById.get(childId)!)),
      agents: linkedAgents,
      worktree: linkedWorktree,
      pullRequest: linkedPullRequest,
    }
  }

  const views = workItems.map(buildItem)
  const viewById = new Map(views.map((item) => [item.id, item]))
  const rootItems = workItems
    .filter((item) => !childIds.has(item.id))
    .map((item) => viewById.get(item.id)!)

  return {
    id: project.id,
    name: project.name,
    root: project.root,
    repo: project.repo,
    workItems: views,
    rootItems,
    worktrees,
    agents,
    pullRequests,
    summary: {
      epics: workItems.filter((item) => item.type === "epic").length,
      issues: workItems.filter((item) => item.type !== "epic").length,
      worktrees: worktrees.length,
      agents: agents.length,
      pullRequests: pullRequests.length,
    },
  }
}

function parseProject(value: unknown, context: string): WorkflowProjectConfig {
  const record = requireRecord(value, context)
  return {
    id: requireString(record.id, `${context}.id`),
    name: requireString(record.name, `${context}.name`),
    root: optionalString(record.root, `${context}.root`),
    repo: parseOptionalRepo(record.repo, `${context}.repo`),
    work_items: parseOptionalArray(record.work_items, `${context}.work_items`, parseWorkItem),
    worktrees: parseOptionalArray(record.worktrees, `${context}.worktrees`, parseWorktree),
    agents: parseOptionalArray(record.agents, `${context}.agents`, parseAgent),
    pull_requests: parseOptionalArray(record.pull_requests, `${context}.pull_requests`, parsePullRequest),
  }
}

function parseWorkItem(value: unknown, context: string): WorkflowWorkItemConfig {
  const record = requireRecord(value, context)
  return {
    id: requireString(record.id, `${context}.id`),
    type: requireEnum(record.type, ["epic", "issue", "ticket"], `${context}.type`),
    title: requireString(record.title, `${context}.title`),
    status: requireEnum(record.status, ["todo", "in_progress", "review", "done", "blocked"], `${context}.status`),
    source: optionalString(record.source, `${context}.source`),
    external_id: optionalString(record.external_id, `${context}.external_id`),
    priority: optionalString(record.priority, `${context}.priority`),
    branch: optionalString(record.branch, `${context}.branch`),
    labels: parseOptionalStringArray(record.labels, `${context}.labels`),
    children: parseOptionalStringArray(record.children, `${context}.children`),
  }
}

function parseWorktree(value: unknown, context: string): WorkflowWorktreeConfig {
  const record = requireRecord(value, context)
  return {
    id: requireString(record.id, `${context}.id`),
    name: requireString(record.name, `${context}.name`),
    path: requireString(record.path, `${context}.path`),
    branch: requireString(record.branch, `${context}.branch`),
    work_item: optionalString(record.work_item, `${context}.work_item`),
  }
}

function parseAgent(value: unknown, context: string): WorkflowAgentConfig {
  const record = requireRecord(value, context)
  return {
    id: requireString(record.id, `${context}.id`),
    provider: requireEnum(record.provider, ["codex", "gemini", "claude", "openai"], `${context}.provider`),
    mode: requireEnum(record.mode, ["read", "write"], `${context}.mode`),
    status: requireString(record.status, `${context}.status`),
    profile: optionalString(record.profile, `${context}.profile`),
    worktree: requireString(record.worktree, `${context}.worktree`),
    work_item: optionalString(record.work_item, `${context}.work_item`),
  }
}

function parsePullRequest(value: unknown, context: string): WorkflowPullRequestConfig {
  const record = requireRecord(value, context)
  return {
    id: requireString(record.id, `${context}.id`),
    work_item: requireString(record.work_item, `${context}.work_item`),
    url: optionalString(record.url, `${context}.url`),
    status: requireString(record.status, `${context}.status`),
    checks: optionalString(record.checks, `${context}.checks`),
  }
}

function parseOptionalRepo(value: unknown, context: string): WorkflowProjectConfig["repo"] {
  if (typeof value === "undefined") return undefined
  const record = requireRecord(value, context)
  return {
    provider: optionalString(record.provider, `${context}.provider`),
    owner: optionalString(record.owner, `${context}.owner`),
    name: optionalString(record.name, `${context}.name`),
    remote: optionalString(record.remote, `${context}.remote`),
  }
}

function parseOptionalArray<T>(
  value: unknown,
  context: string,
  parser: (value: unknown, context: string) => T,
): T[] | undefined {
  if (typeof value === "undefined") return undefined
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`)
  return value.map((entry, index) => parser(entry, `${context}[${index}]`))
}

function parseOptionalStringArray(value: unknown, context: string): string[] | undefined {
  if (typeof value === "undefined") return undefined
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`)
  return value.map((entry, index) => requireString(entry, `${context}[${index}]`))
}

function assertUnique(values: string[], context: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${context} contains duplicate id \`${value}\``)
    seen.add(value)
  }
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${context} must be an object`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, context: string): string | undefined {
  if (typeof value === "undefined") return undefined
  return requireString(value, context)
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, context: string): T[number] {
  const raw = requireString(value, context)
  if (!allowed.includes(raw)) {
    throw new Error(`${context} must be one of: ${allowed.join(", ")}`)
  }
  return raw
}
