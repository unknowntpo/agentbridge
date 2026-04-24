import { describe, expect, it } from "vitest"

import { buildResumeCommandArgs } from "../src/local/sessionOpen.js"

describe("sessionOpen", () => {
  it("returns the provided codex resume command args unchanged", () => {
    expect(buildResumeCommandArgs({
      command: "codex",
      args: ["-p", "default", "resume", "thr-123", "--remote", "ws://127.0.0.1:4591", "--cd", "/repo/agentbridge"],
      cwd: "/repo/agentbridge",
    })).toEqual([
      "-p",
      "default",
      "resume",
      "thr-123",
      "--remote",
      "ws://127.0.0.1:4591",
      "--cd",
      "/repo/agentbridge",
    ])
  })
})
