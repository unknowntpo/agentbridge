import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { GitCommandError, GitCommandRunner, type GitRunner } from "./gitRunner.js"
import type { AgentHubProject, CommandOutcome, ProjectScan, WorktreeScan } from "./types.js"
import { parseWorktreePorcelain, safeBranchName, safeWorktreeSlug, worktreeId } from "./worktreeLayout.js"

export interface AgentHubProjectServiceOptions {
  git?: GitRunner
  projects?: AgentHubProject[]
}

export interface CreateProjectOptions {
  plainDir: string
  repo: string
  branch?: string
}

export interface CreateWorktreeOptions {
  projectPath: string
  slug: string
  branch: string
  base?: string
}

export class AgentHubProjectService {
  readonly #git: GitRunner
  readonly #projects: AgentHubProject[]

  constructor(options: AgentHubProjectServiceOptions = {}) {
    this.#git = options.git ?? new GitCommandRunner()
    this.#projects = (options.projects ?? defaultProjectsFromEnv()).map((project) => ({
      ...project,
      path: canonicalPath(project.path),
    }))
  }

  listProjects(): AgentHubProject[] {
    return this.#projects.map((project) => ({ ...project }))
  }

  async scanProject(inputPath: string): Promise<ProjectScan> {
    const project = this.#resolveProject(inputPath)
    const anchorPath = findAnchorWorktree(project.path)
    const worktreeList = await this.#git.run(anchorPath, ["worktree", "list", "--porcelain"])
    const entries = parseWorktreePorcelain(worktreeList.stdout)
      .filter((entry) => isPathInside(entry.path, project.path))

    const worktrees = await Promise.all(
      (entries.length > 0 ? entries : [{ path: anchorPath, head: "", branch: null }])
        .map((entry) => this.#scanWorktree(entry.path, entry.branch, entry.head)),
    )

    return {
      id: project.id,
      label: project.label,
      rootPath: project.path,
      anchorPath,
      worktrees: worktrees.sort((left, right) => left.name.localeCompare(right.name)),
    }
  }

  async createProject(options: CreateProjectOptions): Promise<CommandOutcome> {
    const plainDir = path.resolve(options.plainDir)
    const branch = safeBranchName(options.branch ?? "main")
    const mainDir = path.join(plainDir, "main")

    if (fs.existsSync(plainDir) && fs.readdirSync(plainDir).length > 0) {
      throw new Error(`Project target already exists and is not empty: ${plainDir}`)
    }
    fs.mkdirSync(plainDir, { recursive: true })

    return this.#git.run(plainDir, ["clone", "--branch", branch, options.repo, mainDir])
  }

  async createWorktree(options: CreateWorktreeOptions): Promise<CommandOutcome> {
    const project = this.#resolveProject(options.projectPath)
    const slug = safeWorktreeSlug(options.slug)
    const branch = safeBranchName(options.branch)
    const base = options.base?.trim() || "HEAD"
    const target = path.join(project.path, slug)

    if (fs.existsSync(target)) {
      throw new Error(`Worktree target already exists: ${target}`)
    }

    const anchorPath = findAnchorWorktree(project.path)
    return this.#git.run(anchorPath, ["worktree", "add", "-b", branch, target, base])
  }

  async #scanWorktree(worktreePath: string, knownBranch: string | null, knownHead: string): Promise<WorktreeScan> {
    const canonicalWorktreePath = canonicalPath(worktreePath)
    const branch = knownBranch ?? await this.#optionalGit(canonicalWorktreePath, ["branch", "--show-current"])
    const head = knownHead || await this.#optionalGit(canonicalWorktreePath, ["rev-parse", "HEAD"]) || "unknown"
    const status = await this.#optionalGit(canonicalWorktreePath, ["status", "--porcelain"]) ?? ""
    const upstream = await this.#optionalGit(canonicalWorktreePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
    const aheadBehind = upstream
      ? await this.#optionalGit(canonicalWorktreePath, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])
      : null
    const [behind, ahead] = aheadBehind?.split(/\s+/).map((value) => Number.parseInt(value, 10)) ?? [0, 0]

    return {
      id: worktreeId(canonicalWorktreePath),
      name: path.basename(canonicalWorktreePath),
      path: canonicalWorktreePath,
      branch: branch && branch.length > 0 ? branch : null,
      upstream: upstream && upstream.length > 0 ? upstream : null,
      head: head.length > 7 ? head.slice(0, 7) : head,
      status: status.trim().length === 0 ? "clean" : "dirty",
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
    }
  }

  async #optionalGit(cwd: string, args: string[]): Promise<string | null> {
    try {
      const outcome = await this.#git.run(cwd, args)
      return outcome.stdout.trim()
    } catch (error) {
      if (error instanceof GitCommandError) {
        return null
      }
      throw error
    }
  }

  #resolveProject(inputPath: string): AgentHubProject {
    const requested = canonicalPath(inputPath)
    const project = this.#projects
      .map((candidate) => ({ ...candidate, path: canonicalPath(candidate.path) }))
      .find((candidate) => requested === candidate.path || isPathInside(requested, candidate.path))
    if (!project) {
      throw new Error(`Path is outside AgentHub project allowlist: ${requested}`)
    }
    return project
  }
}

export function createAgentHubProjectServiceFromEnv(): AgentHubProjectService {
  return new AgentHubProjectService()
}

function defaultProjectsFromEnv(): AgentHubProject[] {
  const raw = process.env.AGENTHUB_PROJECTS_JSON
  if (raw) {
    const parsed = JSON.parse(raw) as AgentHubProject[]
    return parsed.map((project) => ({
      id: project.id,
      label: project.label,
      path: canonicalPath(project.path),
    }))
  }

  const current = resolveCurrentRepoRoot()
  const projects: AgentHubProject[] = [
    { id: "agentbridge", label: "agentbridge", path: current },
  ]
  const minishop = "/Users/unknowntpo/repo/unknowntpo/minishop"
  if (fs.existsSync(minishop)) {
    projects.push({ id: "minishop", label: "minishop demo", path: minishop })
  }
  const dummy = "/Users/unknowntpo/repo/unknowntpo/agentbridge/agenthub-workflow-dummy"
  if (fs.existsSync(dummy)) {
    projects.push({ id: "agenthub-workflow-dummy", label: "AgentHub workflow dummy", path: dummy })
  }
  return projects
}

function resolveCurrentRepoRoot(): string {
  let cursor = path.dirname(fileURLToPath(import.meta.url))
  while (cursor !== path.dirname(cursor)) {
    if (fs.existsSync(path.join(cursor, "package.json"))) {
      return cursor
    }
    cursor = path.dirname(cursor)
  }
  return process.cwd()
}

function findAnchorWorktree(projectPath: string): string {
  const main = path.join(projectPath, "main")
  if (fs.existsSync(path.join(main, ".git"))) {
    return main
  }
  if (fs.existsSync(path.join(projectPath, ".git"))) {
    return projectPath
  }

  const children = fs.readdirSync(projectPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(projectPath, entry.name))
    .filter((candidate) => fs.existsSync(path.join(candidate, ".git")))
    .sort()

  if (children[0]) {
    return children[0]
  }
  throw new Error(`No Git worktree found under ${projectPath}`)
}

function canonicalPath(inputPath: string): string {
  const resolved = path.resolve(inputPath)
  return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
