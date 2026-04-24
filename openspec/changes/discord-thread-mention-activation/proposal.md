## Why

The current Discord continuation flow requires `/codex chat` or `/gemini chat` inside an existing thread. That is mechanically correct but awkward in day-to-day use. In a thread, users expect to continue the conversation naturally by mentioning the bot.

## What Changes

- Keep provider-specific `/codex new` and `/gemini new` in parent channels.
- Replace thread continuation slash commands with mention-driven continuation inside bound threads.
- When a user mentions the bot in a bound thread, AgentBridge strips the bot mention, treats the remaining text as the prompt, and routes it to the provider already bound to that thread.
- Update docs and Discord command registration to reflect that thread continuation is mention-based.

## Impact

- Affected specs:
  - `discord-thread-mentions`
  - `discord-provider-commands`
- Affected code:
  - Discord gateway message routing
  - Discord slash command registration
  - AgentBridge bound-thread routing
  - README
