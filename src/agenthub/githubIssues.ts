import { spawn } from "node:child_process"

export interface GitHubIssueCreateRequest {
  cwd: string
  title: string
  body?: string
  labels?: string[]
  assignee?: string
  repo?: string
}

export interface GitHubIssueCreateResult {
  provider: "github"
  repo: string
  number: number
  title: string
  url: string
  labels: string[]
  assignee?: string
}

export type GitHubIssueCreator = (request: GitHubIssueCreateRequest) => Promise<GitHubIssueCreateResult>

export const createGitHubIssueWithGh: GitHubIssueCreator = async (request) => {
  const title = request.title.trim()
  if (!title) {
    throw new Error("GitHub issue title is required")
  }

  const args = ["issue", "create", "--title", title, "--body", request.body?.trim() || "Created from AgentHub."]
  for (const label of request.labels ?? []) {
    if (label.trim()) args.push("--label", label.trim())
  }
  if (request.assignee?.trim()) {
    args.push("--assignee", request.assignee.trim())
  }
  if (request.repo?.trim()) {
    args.push("--repo", request.repo.trim())
  }

  const stdout = await runGh(request.cwd, args)
  const url = stdout.split(/\r?\n/).find((line) => line.includes("/issues/"))?.trim()
  if (!url) {
    throw new Error(`gh issue create did not return an issue URL: ${stdout}`)
  }
  const parsed = parseGitHubIssueUrl(url)
  return {
    provider: "github",
    repo: parsed.repo,
    number: parsed.number,
    title,
    url,
    labels: request.labels ?? [],
    assignee: request.assignee,
  }
}

export function parseGitHubIssueUrl(url: string): { repo: string; number: number } {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#].*)?$/.exec(url.trim())
  if (!match) {
    throw new Error(`Unsupported GitHub issue URL: ${url}`)
  }
  return {
    repo: match[1]!,
    number: Number.parseInt(match[2]!, 10),
  }
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stdout = ""
    let stderr = ""

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(stdout.trim())
        return
      }
      reject(new Error(stderr.trim() || `gh issue create failed with exit code ${exitCode}`))
    })
  })
}
