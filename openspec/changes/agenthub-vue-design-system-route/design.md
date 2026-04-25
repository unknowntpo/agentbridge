# Design

## Route Model

Use a minimal route switch controlled by `window.location.pathname`:

```text
/                -> existing dashboard shell
/design-system   -> DesignSystemView
```

This avoids adding a router dependency while making the design system run in the same Vue runtime as the dashboard.

## Component Extraction

First extraction slice:

```text
desktop/src/components/
  Badge.vue
  ProviderMark.vue
  AgentChip.vue
  RefBadge.vue
  CommitLogPanel.vue
```

`CommitLogPanel.vue` receives rows, graph data, selected worktree id, and emits worktree/agent selection events. The dashboard supplies live rows; the design system supplies deterministic demo rows. Both routes render the same component and CSS classes.

## Tokens

Create `desktop/src/tokens.css` with canonical `--ab-*` variables plus compatibility aliases for the existing app CSS:

```css
--ab-primary-500: #4f9ca4;
--primary-500: var(--ab-primary-500);
```

`desktop/src/styles.css` imports `tokens.css` and no longer owns root token values. Static `design-system.html` migration can link the same tokens later, but this change focuses on the Vue route.

## Migration Boundary

The static design system remains as a legacy reference during migration. The app sidebar should point to `/design-system`, not `/desktop/design-system.html`, so day-to-day preview uses Vue components.

The existing dashboard shell can remain in `App.vue` for this slice. A later cleanup can split it into `DashboardView.vue` after the shared component boundary is stable.
