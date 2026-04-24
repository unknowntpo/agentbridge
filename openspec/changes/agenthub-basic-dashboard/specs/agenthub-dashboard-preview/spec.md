# AgentHub Dashboard Preview

## ADDED Requirements

### Requirement: Worktree-first dashboard preview

The desktop app SHALL provide a mock dashboard where worktrees are the primary visible objects.

#### Scenario: User opens the AgentHub dashboard

- **WHEN** the user opens the desktop app main route
- **THEN** the app shows a worktree tree canvas
- **AND** each visible card represents one Git worktree
- **AND** the selected worktree is visually distinct.

### Requirement: Mock worktree inspector

The dashboard SHALL provide an inspector for the selected worktree.

#### Scenario: User inspects a selected worktree

- **WHEN** a worktree is selected in the mock dashboard
- **THEN** the inspector shows local Git state
- **AND** remote GitHub state
- **AND** write lock ownership
- **AND** read-only side agents where present
- **AND** recent approvals, runs, and artifacts.

### Requirement: Design system navigation

The design system page SHALL provide a clear way back to the main dashboard preview.

#### Scenario: User reviews design system and returns to preview

- **WHEN** the user is on the design system page
- **THEN** the page exposes a visible navigation control back to the main AgentHub dashboard preview.
