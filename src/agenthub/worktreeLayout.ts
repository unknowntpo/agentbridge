import type { WorktreeEntry } from "./types.js"

export function parseWorktreePorcelain(raw: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let worktreePath: string | null = null
  let head: string | null = null
  let branch: string | null = null
  let prunable = false

  for (const line of [...raw.split(/\r?\n/), ""]) {
    if (line.trim() === "") {
      if (worktreePath && head && !prunable) {
        entries.push({ path: worktreePath, head, branch })
      }
      worktreePath = null
      head = null
      branch = null
      prunable = false
      continue
    }

    if (line.startsWith("worktree ")) {
      worktreePath = line.slice("worktree ".length)
    } else if (line.startsWith("HEAD ")) {
      head = line.slice("HEAD ".length)
    } else if (line.startsWith("branch refs/heads/")) {
      branch = line.slice("branch refs/heads/".length)
    } else if (line.startsWith("prunable")) {
      prunable = true
    }
  }

  return entries
}

export function safeWorktreeSlug(value: string): string {
  const slug = value.trim()
  if (
    slug.length === 0 ||
    slug.startsWith("-") ||
    slug.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug === "." ||
    slug === ".."
  ) {
    throw new Error(`unsafe worktree slug: ${value}`)
  }
  return slug
}

export function safeBranchName(value: string): string {
  const branch = value.trim()
  if (
    branch.length === 0 ||
    branch.startsWith("-") ||
    branch.includes("..") ||
    branch.includes("\\") ||
    branch.endsWith("/") ||
    branch.includes(" ")
  ) {
    throw new Error(`unsafe branch name: ${value}`)
  }
  return branch
}

export function worktreeId(path: string): string {
  return path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
