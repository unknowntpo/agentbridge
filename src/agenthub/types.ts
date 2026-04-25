export interface AgentHubProject {
  id: string
  label: string
  path: string
}

export interface ProjectScan {
  id: string
  label: string
  rootPath: string
  anchorPath: string
  worktrees: WorktreeScan[]
}

export interface WorktreeScan {
  id: string
  name: string
  path: string
  branch: string | null
  upstream: string | null
  head: string
  status: "clean" | "dirty"
  ahead: number
  behind: number
}

export interface CommandOutcome {
  ok: boolean
  command: string
  args: string[]
  cwd: string
  stdout: string
  stderr: string
  exitCode: number | null
  elapsedMs: number
  timedOut: boolean
  message: string
}

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
}
