import { spawn } from "node:child_process"

export interface OpenManagedSessionOptions {
  command: string
  args: string[]
  cwd: string
}

export function buildResumeCommandArgs(options: OpenManagedSessionOptions): string[] {
  return [...options.args]
}

export async function openManagedSession(options: OpenManagedSessionOptions): Promise<number> {
  const args = buildResumeCommandArgs(options)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: options.cwd,
    })

      child.once("error", (error) => {
      reject(error)
    })

    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Interactive CLI exited from signal ${signal}`))
        return
      }

      if (code && code !== 0) {
        reject(new Error(`Interactive CLI exited with code ${code}`))
        return
      }

      resolve()
    })
  })

  return 0
}
