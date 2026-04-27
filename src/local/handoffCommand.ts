import type { ProviderKind } from "../types.js"

export interface SessionOpenCommandOptions {
  sessionId: string
  provider: ProviderKind
  cwd: string
}

export function buildSessionOpenCommand(options: SessionOpenCommandOptions): string {
  return [
    "agentbridge",
    "session",
    "open",
    "--session-id",
    quoteShell(options.sessionId),
    "--provider",
    quoteShell(options.provider),
    "--cwd",
    quoteShell(options.cwd),
  ].join(" ")
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}
