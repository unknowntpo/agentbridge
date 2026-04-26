import type { WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView } from "../agenthub/workflowConfig.js"

export const WorkflowCliView = {
  TaskTree: "task-tree",
  Dependency: "dependency",
  Ready: "ready",
  Agents: "agents",
} as const

export type WorkflowCliView = (typeof WorkflowCliView)[keyof typeof WorkflowCliView]

const WORKFLOW_CLI_VIEW_VALUES = new Set<string>(Object.values(WorkflowCliView))

export function renderWorkflowTree(model: WorkflowViewModel): string {
  return model.projects.map(renderProject).join("\n\n")
}

export function renderWorkflowView(model: WorkflowViewModel, view: WorkflowCliView): string {
  switch (view) {
    case WorkflowCliView.TaskTree:
      return renderWorkflowTree(model)
    case WorkflowCliView.Dependency:
      return model.projects.map(renderDependencyProject).join("\n\n")
    case WorkflowCliView.Ready:
      return model.projects.map(renderReadyProject).join("\n\n")
    case WorkflowCliView.Agents:
      return model.projects.map(renderAgentsProject).join("\n\n")
  }
}

export function parseWorkflowCliView(input: string | undefined): WorkflowCliView {
  if (!input) return WorkflowCliView.TaskTree
  if (isWorkflowCliView(input)) {
    return input
  }
  throw new Error("workflow view must be one of: task-tree, dependency, ready, agents")
}

function isWorkflowCliView(input: string): input is WorkflowCliView {
  return WORKFLOW_CLI_VIEW_VALUES.has(input)
}

function renderProject(project: WorkflowProjectView): string {
  const lines = [
    `${project.name} (${project.id})`,
    `repo: ${formatRepo(project)}`,
    `summary: ${project.summary.epics} epics, ${project.summary.issues} issues, ${project.summary.worktrees} worktrees, ${project.summary.agents} agents, ${project.summary.pullRequests} PRs`,
  ]

  project.rootItems.forEach((item, index) => {
    lines.push(...renderItem(item, "", index === project.rootItems.length - 1))
  })

  return lines.join("\n")
}

function renderDependencyProject(project: WorkflowProjectView): string {
  const lines = [
    `${project.name} (${project.id})`,
    "Dependency View",
  ]

  const items = project.workItems.filter((item) => item.type !== "epic")
  for (const item of items) {
    lines.push(`${item.id} [${item.status}] ${item.title}`)
    if (item.dependents.length === 0) {
      lines.push("  └─> none")
      continue
    }
    item.dependents.forEach((dependent, index) => {
      const connector = index === item.dependents.length - 1 ? "└─>" : "├─>"
      lines.push(`  ${connector} ${dependent.id} [${dependent.status}] ${dependent.title}`)
    })
  }

  return lines.join("\n")
}

function renderReadyProject(project: WorkflowProjectView): string {
  const items = project.workItems.filter((item) => item.type !== "epic")
  const ready = items.filter((item) => item.status === "todo" && item.dependencies.every((dependency) => dependency.status === "done"))
  const blocked = items.filter((item) => item.dependencies.some((dependency) => dependency.status !== "done"))

  const lines = [
    `${project.name} (${project.id})`,
    "Ready View",
    "Ready",
  ]
  if (ready.length === 0) {
    lines.push("- none")
  } else {
    for (const item of ready) lines.push(`- ${item.id} ${item.title} [${item.status}]`)
  }

  lines.push("Blocked")
  if (blocked.length === 0) {
    lines.push("- none")
  } else {
    for (const item of blocked) {
      lines.push(`- ${item.id} ${item.title} [${item.status}]`)
      lines.push(`  blocked by: ${formatDependencies(item)}`)
    }
  }

  return lines.join("\n")
}

function renderAgentsProject(project: WorkflowProjectView): string {
  const lines = [
    `${project.name} (${project.id})`,
    "Agents View",
  ]

  if (project.agents.length === 0) {
    lines.push("- none")
    return lines.join("\n")
  }

  for (const agent of project.agents) {
    const worktree = project.worktrees.find((candidate) => candidate.id === agent.worktree)
    const item = agent.work_item ? project.workItems.find((candidate) => candidate.id === agent.work_item) : undefined
    lines.push(`${agentStatusIcon(agent.status)} ${agent.id}`)
    lines.push(`  provider: ${agent.provider}   mode: ${agent.mode}   status: ${agent.status}`)
    lines.push(`  branch: ${worktree?.branch ?? "unknown"}`)
    lines.push(`  worktree: ${worktree?.path ?? agent.worktree}`)
    lines.push(`  task: ${item ? `${item.id} ${item.title} [${item.status}]` : "none"}`)
    lines.push(`  deps: ${item ? formatDependencies(item) : "none"}`)
  }

  return lines.join("\n")
}

function renderItem(item: WorkflowWorkItemView, prefix: string, last: boolean): string[] {
  const branch = last ? "└─" : "├─"
  const childPrefix = `${prefix}${last ? "   " : "│  "}`
  const lines = [
    `${prefix}${branch} ${item.type} ${item.id} ${item.title} [${item.status}]`,
  ]

  const details = [
    `worktree: ${formatWorktree(item)}`,
    `agents: ${formatAgents(item)}`,
    `pr: ${formatPullRequest(item)}`,
    `deps: ${formatDependencies(item)}`,
  ]
  details.forEach((detail, index) => {
    const detailLast = index === details.length - 1 && item.children.length === 0
    lines.push(`${childPrefix}${detailLast ? "└─" : "├─"} ${detail}`)
  })

  item.children.forEach((child, index) => {
    lines.push(...renderItem(child, childPrefix, index === item.children.length - 1))
  })

  return lines
}

function formatRepo(project: WorkflowProjectView): string {
  if (!project.repo) return "local"
  const owner = project.repo.owner ? `${project.repo.owner}/` : ""
  return `${project.repo.provider ?? "git"}:${owner}${project.repo.name ?? project.repo.remote ?? "unknown"}`
}

function formatWorktree(item: WorkflowWorkItemView): string {
  if (!item.worktree) return "none"
  return `${item.worktree.path} (${item.worktree.branch})`
}

function formatAgents(item: WorkflowWorkItemView): string {
  if (item.agents.length === 0) return "none"
  return item.agents.map((agent) => `${agent.provider} ${agent.mode} ${agent.status}`).join(", ")
}

function formatPullRequest(item: WorkflowWorkItemView): string {
  if (!item.pullRequest) return "none"
  return `${item.pullRequest.id} ${item.pullRequest.status}${item.pullRequest.checks ? ` checks:${item.pullRequest.checks}` : ""}`
}

function formatDependencies(item: WorkflowWorkItemView): string {
  if (item.dependencies.length === 0) return "none"
  return item.dependencies.map((dependency) => `${dependency.id}(${dependency.status})`).join(", ")
}

function agentStatusIcon(status: string): string {
  return status === "running" ? "[*]" : "[.]"
}
