## ADDED Requirements

### Requirement: Vue-backed design system route

AgentHub SHALL provide a design system route inside the same Vue desktop application runtime as the dashboard.

#### Scenario: User opens the design system from dashboard navigation

- **GIVEN** the desktop app is running
- **WHEN** the user activates the Design System navigation item
- **THEN** the app navigates to `/design-system`
- **AND** the design system renders through Vue components rather than static hand-written preview markup.

### Requirement: Shared CommitLogPanel implementation

AgentHub SHALL render the dashboard commit log and the design system commit log preview through the same Vue component implementation.

#### Scenario: Dashboard and design system render commit log

- **GIVEN** commit rows and commit graph data are available
- **WHEN** the dashboard renders its commit log
- **AND** the design system renders its commit log preview
- **THEN** both routes use the same `CommitLogPanel` component
- **AND** the design system supplies demo data instead of duplicating the component markup.

### Requirement: Shared design tokens

AgentHub SHALL keep desktop design tokens in a shared stylesheet imported by the Vue app styles.

#### Scenario: Commit log consumes token values

- **GIVEN** the desktop CSS is loaded
- **WHEN** commit log styles reference color or surface tokens
- **THEN** those tokens resolve from the shared token source or compatibility aliases.

