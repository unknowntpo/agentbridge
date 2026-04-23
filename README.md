# AgentBridge

Bridge Discord conversations into a local Codex session on macOS.

## Runtime

This project is Bun-first:

- install: `bun install`
- test: `bun test` is not used here; run `bun run test`
- typecheck: `bun run check`
- build: `bun run build`
- start: `bun run start`

Bun is the single tool for install, task running, and app startup.

## Discord Setup

1. Go to <https://discord.com/developers/applications>.
2. Create a new application.
3. Open the **Bot** tab and create a bot user.
4. Under **Privileged Gateway Intents**, enable:
   - Message Content Intent
5. From **OAuth2 > General**, copy:
   - `Client ID` into `DISCORD_CLIENT_ID`
   - `Client Secret` into `DISCORD_CLIENT_SECRET`
   - your server id into `DISCORD_GUILD_ID` if you want slash commands to register immediately for that server
6. From the **Bot** tab, copy the bot token into `.env` as `DISCORD_TOKEN`.
7. Open **OAuth2 > URL Generator**.
8. Select scopes:
   - `bot`
9. Select bot permissions:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Create Public Threads` if you want the bot to help in thread-based workflows
   - `Send Messages in Threads`
10. Open the generated URL and invite the bot to your server.
11. Optionally set `AGENTBRIDGE_ALLOWED_CHANNEL_IDS` to a comma-separated list of allowed channel ids. For thread traffic, the adapter also accepts threads whose parent channel is in that allowlist.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Ensure `codex` is installed and logged in locally.
3. Fill `.env` with your Discord credentials. Slash command registration uses `DISCORD_CLIENT_ID` and works fastest when `DISCORD_GUILD_ID` is set.
4. Install dependencies:

```bash
bun install
```

5. Run tests and typecheck:

```bash
bun run test
bun run check
```

6. Start the bridge:

```bash
bun run start
```

## Discord Usage

- Start a fresh thread-bound session from a parent channel: `/codex new prompt:<your prompt>`

## Slash Commands

- Set `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` in `.env`
- Restart the bridge with `bun run start`
- The bridge will register `/codex`
- In Discord, type `/codex` and choose one of:
  - `new`

For local testing, guild commands are preferred because they appear almost immediately. Global commands can take longer to propagate.

Current slash UX:

- `/codex new` only works from a parent channel. It creates a new thread, posts `> <prompt>` in that thread, and then posts the Codex reply there.
- `/codex new` inside an existing thread is ignored.
- Later replies in the created thread are ignored. Start another request with a fresh `/codex new` from the parent channel.

## Notes

- State is stored in SQLite with WAL mode enabled.
- The bridge uses `codex exec --json` and `codex exec resume ... --json`.
