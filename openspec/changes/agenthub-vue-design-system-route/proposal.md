# AgentHub Vue Design System Route

## Why

AgentHub currently has two implementations of key UI contracts:

- the running dashboard in `desktop/src/App.vue`
- the static design system in `desktop/design-system.html`

This creates implementation drift. Token drift is only one symptom; markup, z-index, graph layout, and component behavior can also diverge because the design system hand-codes preview HTML strings instead of rendering the same Vue components as the app.

## What

- Move the design system entrypoint into the Vue desktop app as `/design-system`.
- Extract the commit log UI into a shared Vue component used by both the dashboard and design system route.
- Extract the smallest reusable primitives needed by the commit log slice: provider icon/chip, badge, and ref badge.
- Add a shared token stylesheet that both runtime UI and extracted components consume.
- Keep the static `desktop/design-system.html` available during migration, but stop using its CommitLogPanel string preview as the source of truth.

## Non-goals

- Do not migrate the entire 3500-line static design system in one change.
- Do not change commit graph path math.
- Do not introduce Vue Router or new dependencies.
- Do not change backend AgentBridge or Tauri command behavior.

