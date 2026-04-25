import type { AgentSession, WorktreeScan } from "./store.js"

export type CommitLane = "main" | "feature" | "docs" | "experiment"
export type CommitNodeKind = "normal" | "head" | "merge"

export interface CommitRefBadge {
  label: string
  tone: "head" | "branch" | "experiment" | "version"
}

export interface CommitGraphPoint {
  lane: CommitLane
  kind: CommitNodeKind
}

export interface CommitLogRow {
  id: string
  sha: string
  message: string
  detail: string
  refs: CommitRefBadge[]
  worktreeId: string | null
  worktreeName: string
  agents: AgentSession[]
  status: string
  graph: CommitGraphPoint
}

export function buildCommitLogRows(
  worktrees: WorktreeScan[],
  sessions: AgentSession[],
): CommitLogRow[] {
  const byName = new Map(worktrees.map((worktree) => [worktree.name, worktree]))
  const byBranch = new Map(worktrees.flatMap((worktree) => (
    worktree.branch ? [[worktree.branch, worktree] as const] : []
  )))
  const fallback = worktrees[0] ?? null
  const main = byName.get("main") ?? byBranch.get("main") ?? fallback
  const feature = findWorktree(worktrees, ["agent", "drawer", "feature", "workflow"]) ?? fallback
  const docs = findWorktree(worktrees, ["docs", "permission"]) ?? fallback
  const experiment = findWorktree(worktrees, ["experiment", "cache", "exp"]) ?? fallback

  const sessionFor = (worktree: WorktreeScan | null): AgentSession[] => {
    if (!worktree) return []
    return sessions.filter((session) => session.worktreeId === worktree.id)
  }

  const rows: CommitLogRow[] = [
    {
      id: "commit-agent-drawer-head",
      sha: shortSha(feature?.head, "d4e5f6a"),
      message: "Add deploy agent drawer",
      detail: "selected worktree head",
      refs: [
        { label: "HEAD", tone: "head" },
        { label: feature?.branch ?? "feat/agent-drawer", tone: "branch" },
      ],
      worktreeId: feature?.id ?? null,
      worktreeName: worktreeLabel(feature, "wt/agent-drawer"),
      agents: sessionFor(feature),
      status: feature?.status ?? "clean",
      graph: { lane: "feature", kind: "head" },
    },
    {
      id: "commit-main-parent",
      sha: "f6a7b8c",
      message: "Split local scan from GitHub enrichment",
      detail: "main ancestry",
      refs: [],
      worktreeId: main?.id ?? null,
      worktreeName: worktreeLabel(main, "main"),
      agents: sessionFor(main).slice(0, 1),
      status: main?.status ?? "clean",
      graph: { lane: "main", kind: "normal" },
    },
    {
      id: "commit-docs-head",
      sha: shortSha(docs?.head, "e7fa89b"),
      message: "Document permission model",
      detail: "docs branch checked out",
      refs: [{ label: docs?.branch ?? "docs/permissions", tone: "branch" }],
      worktreeId: docs?.id ?? null,
      worktreeName: worktreeLabel(docs, "wt/docs-permissions"),
      agents: sessionFor(docs),
      status: docs?.status ?? "clean",
      graph: { lane: "docs", kind: "head" },
    },
    {
      id: "commit-merge-docs",
      sha: "8c9d0e1",
      message: "Merge docs permissions into main",
      detail: "merge commit",
      refs: [],
      worktreeId: main?.id ?? null,
      worktreeName: worktreeLabel(main, "main"),
      agents: [],
      status: "clean",
      graph: { lane: "main", kind: "merge" },
    },
    {
      id: "commit-experiment-head",
      sha: shortSha(experiment?.head, "b1c2d3e"),
      message: "Try cached scan experiment",
      detail: "experiment branch checked out",
      refs: [{ label: experiment?.branch ?? "exp/cache", tone: "experiment" }],
      worktreeId: experiment?.id ?? null,
      worktreeName: worktreeLabel(experiment, "wt/experiment-cache"),
      agents: sessionFor(experiment),
      status: experiment?.status ?? "dirty",
      graph: { lane: "experiment", kind: "head" },
    },
    {
      id: "commit-merge-experiment",
      sha: "c3d4e5f",
      message: "Merge experiment into main",
      detail: "second merge",
      refs: [],
      worktreeId: main?.id ?? null,
      worktreeName: worktreeLabel(main, "main"),
      agents: [],
      status: "clean",
      graph: { lane: "main", kind: "merge" },
    },
    {
      id: "commit-release",
      sha: "7a8b9c0",
      message: "Release AgentHub workflow preview",
      detail: "main tip",
      refs: [
        { label: "v0.2", tone: "version" },
        { label: main?.branch ?? "main", tone: "head" },
      ],
      worktreeId: main?.id ?? null,
      worktreeName: worktreeLabel(main, "main"),
      agents: sessionFor(main),
      status: main?.status ?? "clean",
      graph: { lane: "main", kind: "head" },
    },
  ]

  return rows
}

export function commitGraphSvgPath(rowCount: number): {
  viewBox: string
  main: string
  feature: string
  docs: string
  experiment: string
  points: Array<{ id: string; x: number; y: number; lane: CommitLane; kind: CommitNodeKind }>
} {
  const rowHeight = 92
  const top = rowHeight / 2
  const bottom = top + Math.max(rowCount - 1, 0) * rowHeight
  const x = { main: 32, feature: 50, docs: 68, experiment: 86 }
  const y = (index: number) => top + index * rowHeight

  return {
    viewBox: `0 0 112 ${rowCount * rowHeight}`,
    main: `M ${x.main} ${top} V ${bottom}`,
    feature: `M ${x.main} ${y(1)} C ${x.feature} ${y(1)}, ${x.feature} ${y(0)}, ${x.feature} ${y(0)} V ${y(0)}`,
    docs: `M ${x.main} ${y(1)} C ${x.docs} ${y(1)}, ${x.docs} ${y(2)}, ${x.docs} ${y(2)} V ${y(2)} C ${x.docs} ${y(3)}, ${x.main} ${y(3)}, ${x.main} ${y(3)}`,
    experiment: `M ${x.main} ${y(3)} C ${x.experiment} ${y(3)}, ${x.experiment} ${y(4)}, ${x.experiment} ${y(4)} V ${y(4)} C ${x.experiment} ${y(5)}, ${x.main} ${y(5)}, ${x.main} ${y(5)}`,
    points: [
      { id: "commit-agent-drawer-head", x: x.feature, y: y(0), lane: "feature", kind: "head" },
      { id: "commit-main-parent", x: x.main, y: y(1), lane: "main", kind: "normal" },
      { id: "commit-docs-head", x: x.docs, y: y(2), lane: "docs", kind: "head" },
      { id: "commit-merge-docs", x: x.main, y: y(3), lane: "main", kind: "merge" },
      { id: "commit-experiment-head", x: x.experiment, y: y(4), lane: "experiment", kind: "head" },
      { id: "commit-merge-experiment", x: x.main, y: y(5), lane: "main", kind: "merge" },
      { id: "commit-release", x: x.main, y: y(6), lane: "main", kind: "head" },
    ].slice(0, rowCount) as Array<{ id: string; x: number; y: number; lane: CommitLane; kind: CommitNodeKind }>,
  }
}

function findWorktree(worktrees: WorktreeScan[], hints: string[]): WorktreeScan | null {
  return worktrees.find((worktree) => {
    const haystack = `${worktree.name} ${worktree.branch ?? ""}`.toLowerCase()
    return hints.some((hint) => haystack.includes(hint))
  }) ?? null
}

function shortSha(value: string | undefined, fallback: string): string {
  return (value || fallback).slice(0, 7)
}

function worktreeLabel(worktree: WorktreeScan | null, fallback: string): string {
  if (!worktree) return fallback
  if (worktree.name === "main") return "main"
  return worktree.name.startsWith("wt/") ? worktree.name : `wt/${worktree.name.replace(/^feat\//, "")}`
}
