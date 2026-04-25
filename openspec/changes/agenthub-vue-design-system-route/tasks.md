# Tasks

- [x] Add Spectra proposal, design, and spec delta for Vue-backed design system route.
- [x] Extract shared token stylesheet and import it from desktop styles.
- [x] Extract Badge, ProviderMark, AgentChip, RefBadge, and CommitLogPanel Vue components.
- [x] Add an App-level route switch that keeps the existing dashboard shell and renders Vue DesignSystemView for `/design-system`.
- [x] Add `/design-system` Vue route with demo data using the same CommitLogPanel component.
- [x] Update dashboard navigation to open `/design-system`.
- [x] Add tests that lock the route switch and CommitLogPanel component behavior.
- [x] Run `spectra validate "agenthub-vue-design-system-route"`, `bun run check`, `bun run test`, and `bun run desktop:build`.
