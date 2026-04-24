import { spawn } from "node:child_process"

import type { CodexTurnResult, PermissionProfile, SessionAdapter } from "../types.js"

export class GeminiCliAdapter implements SessionAdapter {
  readonly provider = "gemini" as const
  readonly backendKind = "cli" as const

  constructor(
    private readonly command = "gemini",
    private readonly extraArgs: string[] = [],
    private readonly cwd = process.cwd(),
    private readonly permissionProfile: PermissionProfile = "workspace-write",
  ) {}

  startSession(prompt: string): Promise<CodexTurnResult> {
    return this.run([...this.extraArgs, "-o", "json", prompt])
  }

  resumeSession(sessionId: string, prompt: string): Promise<CodexTurnResult> {
    return this.run([...this.extraArgs, "--resume", sessionId, "-o", "json", prompt])
  }

  private run(args: string[]): Promise<CodexTurnResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, [...this.buildProfileArgs(), ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        cwd: this.cwd,
      })

      let stdout = ""
      let stderr = ""

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      child.on("error", reject)
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Gemini exited with code ${code ?? -1}`))
          return
        }

        try {
          resolve(parseGeminiJson(stdout))
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  private buildProfileArgs(): string[] {
    if (this.permissionProfile === "workspace-read") {
      return ["--sandbox"]
    }

    if (this.permissionProfile === "workspace-write") {
      return []
    }

    throw new Error("Gemini full-access is not supported in AgentBridge yet.")
  }
}

export function parseGeminiJson(stdout: string): CodexTurnResult {
  const parsed = parseJsonObject(stdout)
  const sessionId = typeof parsed.session_id === "string" ? parsed.session_id : null
  if (!sessionId) {
    throw new Error("Gemini JSON output did not include a session_id")
  }

  const output = typeof parsed.response === "string" ? parsed.response.trim() : ""
  return {
    sessionId,
    output,
    events: [parsed],
  }
}

function parseJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error("Gemini JSON output was empty")
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error("Failed to parse Gemini JSON output")
  }
}
