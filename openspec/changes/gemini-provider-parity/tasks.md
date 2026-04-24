## 1. Spec

- [x] 1.1 Define provider-aware runtime and binding requirements.
- [x] 1.2 Define Discord `/gemini new` and `/gemini chat` with parity to Codex UX.
- [x] 1.3 Define local `agentbridge session new/open --provider gemini` behavior.

## 2. Implementation

- [x] 2.1 Refactor runtime types/state to record provider identity separately from backend kind.
- [x] 2.2 Introduce a provider registry so bridge/CLI routes sessions to Codex or Gemini without hard-coded conditionals.
- [x] 2.3 Implement a Gemini managed-session adapter using Gemini CLI JSON output plus `--resume`.
- [x] 2.4 Extend Discord slash commands and local CLI options for Gemini parity.
- [x] 2.5 Update docs/examples to show provider-aware usage.

## 3. Verification

- [x] 3.1 Add unit tests for provider-aware routing and Gemini adapter parsing.
- [x] 3.2 Add Discord/local CLI tests for Gemini command parity.
- [x] 3.3 Run `bun run test`, `bun run check`, and `spectra validate "gemini-provider-parity"`.
