## Summary

Thread creation remains explicit and provider-specific through slash commands. Thread continuation becomes implicit through mention routing.

## Decisions

- `/codex new` and `/gemini new` remain the only Discord slash entrypoints.
- Inside a bound Discord thread, a message triggers AgentBridge only when it explicitly mentions the bot and has non-empty text after mention stripping.
- The binding remains authoritative. The mention does not carry a provider selector; AgentBridge resumes the provider already bound to the thread.
- Plain thread messages without a bot mention remain ignored.
- Existing internal `chat` routing can stay as a compatibility layer, but it is no longer part of the registered slash UX.

## Failure Handling

- Mention in an unbound thread: reply with guidance to start a thread via `/codex new` or `/gemini new`.
- Mention in a legacy binding: reply with the existing migration guidance.
- Mention with no prompt text after stripping the bot mention: ignore it.
