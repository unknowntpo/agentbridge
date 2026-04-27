import { spawnSync } from "node:child_process"

export interface ClipboardCopyResult {
  ok: boolean
  message: string
}

export type ClipboardCopy = (text: string) => Promise<ClipboardCopyResult>

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  const candidates = clipboardCandidates()

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      input: text,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "pipe"],
    })
    if (result.status === 0) {
      return { ok: true, message: `copied to clipboard via ${candidate.command}` }
    }
  }

  return {
    ok: false,
    message: "clipboard command unavailable; copy the handoff command manually",
  }
}

function clipboardCandidates(): Array<{ command: string; args: string[] }> {
  if (process.platform === "darwin") return [{ command: "pbcopy", args: [] }]
  if (process.platform === "win32") return [{ command: "clip", args: [] }]
  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ]
}
