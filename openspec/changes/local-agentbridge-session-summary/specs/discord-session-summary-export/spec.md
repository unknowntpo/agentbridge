## ADDED Requirements

### Requirement: Local session export creates a Discord thread

The exporter SHALL create a new public Discord thread under a configured parent channel when exporting a local Codex session summary.

#### Scenario: Summary thread is created from local session

- **WHEN** the local exporter runs successfully
- **THEN** a new Discord thread is created under the configured summary parent channel

### Requirement: Exported summary contains only visible chat

The exporter SHALL summarize only visible chat from the selected Codex session. The summary SHALL include user messages and assistant messages, and SHALL exclude tool calls, system/developer instructions, and the `/agentbridge` command marker.

#### Scenario: Summary excludes non-chat events

- **GIVEN** a selected Codex session contains tool events and a local `/agentbridge` command prompt marker
- **WHEN** the exporter builds the summary
- **THEN** the posted Discord content contains only the visible user and assistant chat summary

### Requirement: Export may mention the focus user

If a focus user id is configured, the exported summary SHALL begin by mentioning that Discord user before the summary content.

#### Scenario: Focus mention is prepended

- **WHEN** `AGENTBRIDGE_DISCORD_SUMMARY_MENTION_USER_ID` is configured
- **THEN** the first visible Discord summary message begins with `<@user-id>`
