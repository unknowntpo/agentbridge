import type { ProjectScan, WorktreeScan } from "./types.js"
import type { WorkflowProjectView, WorkflowViewModel } from "./workflowConfig.js"

export function deriveWorkflowViewModelFromProjectScan(scan: ProjectScan): WorkflowViewModel {
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
  const worktrees = scan.worktrees.map((worktree) => {
    const commitId = `commit-${worktree.head}`
    return {
      id: worktree.id,
      name: worktree.name,
      path: worktree.path,
      branch: worktree.branch ?? "detached",
      work_item: commitIds.has(commitId) ? commitId : undefined,
    }
  })

  const workItems = commits.map((commit) => ({
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
      agents: [],
      worktree: worktrees.find((worktree) => worktree.work_item === item.id) ?? null,
      pullRequest: null,
    })),
    rootItems: [],
    worktrees,
    agents: [],
    pullRequests: [],
    commits,
    summary: {
      epics: 0,
      issues: workItems.length,
      worktrees: scan.worktrees.length,
      agents: 0,
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
