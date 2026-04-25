import { spawn } from "node:child_process"

import type { CommandOutcome } from "./types.js"

export interface GitRunner {
  run(cwd: string, args: string[]): Promise<CommandOutcome>
}

export interface GitCommandRunnerOptions {
  timeoutMs?: number
}

export class GitCommandRunner implements GitRunner {
  readonly #timeoutMs: number

  constructor(options: GitCommandRunnerOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? 30_000
  }

  run(cwd: string, args: string[]): Promise<CommandOutcome> {
    return runCommand("git", args, cwd, this.#timeoutMs)
  }
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<CommandOutcome> {
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      const elapsedMs = Date.now() - started
      const outcome: CommandOutcome = {
        ok: exitCode === 0 && !timedOut,
        command,
        args,
        cwd,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        elapsedMs,
        timedOut,
        message: `${command} ${args.join(" ")} ${exitCode === 0 && !timedOut ? "succeeded" : "failed"}`,
      }

      if (!outcome.ok) {
        reject(new GitCommandError(outcome))
        return
      }

      resolve(outcome)
    })
  })
}

export class GitCommandError extends Error {
  readonly outcome: CommandOutcome

  constructor(outcome: CommandOutcome) {
    super(outcome.stderr || outcome.message)
    this.name = "GitCommandError"
    this.outcome = outcome
  }
}
