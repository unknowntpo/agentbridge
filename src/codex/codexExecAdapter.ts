import { spawn } from "node:child_process"

import type { CodexAdapter, CodexTurnResult } from "../types.js"

export class CodexExecAdapter implements CodexAdapter {
  constructor(
    private readonly command = "codex",
    private readonly extraArgs: string[] = [],
  ) {}

  startSession(prompt: string): Promise<CodexTurnResult> {
    return this.run(["exec", "--json", ...this.extraArgs, prompt])
  }

  resumeSession(sessionId: string, prompt: string): Promise<CodexTurnResult> {
    return this.run(["exec", "resume", sessionId, "--json", ...this.extraArgs, prompt])
  }

  private run(args: string[]): Promise<CodexTurnResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        stdio: ["ignore", "pipe", "pipe"],
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
          reject(new Error(stderr || `Codex exited with code ${code ?? -1}`))
          return
        }

        try {
          resolve(parseCodexJson(stdout))
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

export function parseCodexJson(stdout: string): CodexTurnResult {
  const events = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)

  let sessionId = ""
  const outputParts: string[] = []

  for (const event of events) {
    const data = event as CodexEvent

    if (!sessionId && typeof data.session_id === "string") {
      sessionId = data.session_id
    }

    if (typeof data.output_text === "string") {
      outputParts.push(data.output_text)
    }

    if (data.type === "message" && typeof data.content === "string") {
      outputParts.push(data.content)
    }

    if (data.type === "final" && typeof data.text === "string") {
      outputParts.push(data.text)
    }
  }

  if (!sessionId) {
    throw new Error("Codex output did not include a session id")
  }

  const output = outputParts.join("\n").trim()
  return { sessionId, output, events }
}

interface CodexEvent {
  type?: string
  text?: string
  content?: string
  output_text?: string
  session_id?: string
}
