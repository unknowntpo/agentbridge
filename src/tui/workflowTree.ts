import type { WorkflowProjectView, WorkflowViewModel, WorkflowWorkItemView } from "../agenthub/workflowConfig.js"

export function renderWorkflowTree(model: WorkflowViewModel): string {
  return model.projects.map(renderProject).join("\n\n")
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
