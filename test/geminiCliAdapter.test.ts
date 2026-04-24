import { describe, expect, it } from "vitest"

import { parseGeminiJson } from "../src/gemini/geminiCliAdapter.js"

describe("geminiCliAdapter", () => {
  it("parses clean json output", () => {
    expect(parseGeminiJson(JSON.stringify({
      session_id: "gemini-session-1",
      response: "hello from gemini",
    }))).toEqual({
      sessionId: "gemini-session-1",
      output: "hello from gemini",
      events: [{ session_id: "gemini-session-1", response: "hello from gemini" }],
    })
  })

  it("parses json payload wrapped in extra stdout noise", () => {
    const result = parseGeminiJson([
      "some log line",
      JSON.stringify({
        session_id: "gemini-session-2",
        response: "wrapped response",
      }),
      "another log line",
    ].join("\n"))

    expect(result.sessionId).toBe("gemini-session-2")
    expect(result.output).toBe("wrapped response")
  })
})
