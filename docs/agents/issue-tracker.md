# Issue tracker: Linear

Issues and specs for this repo live in the **LinearFB** workspace on Linear, under the **LinearFB** team. Use the `linear-mcp-server` MCP tools for all operations.

## Workspace details

- **Workspace**: LinearFB (`https://linear.app/linearfb`)
- **Team**: LinearFB (ID: `e54a1a9e-9b96-447a-8f6a-b8f1dd6b40d2`)
- **Issue prefix**: `LIN-`

## Existing labels

| Label         | Color     |
| ------------- | --------- |
| `Exploration` | `#26b5ce` |
| `Improvement` | `#4EA7FC` |
| `Feature`     | `#BB87FC` |
| `Bug`         | `#EB5757` |

## Existing statuses

| Status      | Type        |
| ----------- | ----------- |
| Backlog     | backlog     |
| Todo        | unstarted   |
| In Progress | started     |
| In Review   | started     |
| Done        | completed   |
| Canceled    | canceled    |
| Duplicate   | duplicate   |

## Conventions

- **Create an issue**: Use `save_issue` with `title`, `team: "LinearFB"`, and `description` (Markdown). Add labels, priority, and state as needed.
- **Read an issue**: Use `get_issue` with the identifier (e.g. `LIN-123`). Pass `includeRelations: true` for blocking/related edges.
- **List issues**: Use `list_issues` with filters (`team`, `status`, `label`, `assignee`, `query`).
- **Update an issue**: Use `save_issue` with `id: "LIN-123"` plus the fields to change.
- **Comment on an issue**: Use `save_comment` with `issueId` and `body`.
- **Apply labels**: Use `save_issue` with `id` and `labels: ["Bug", "Feature"]`. Note: `labels` replaces the full set.
- **Close**: Use `save_issue` with `id` and `state: "Done"` or `state: "Canceled"`.

## When a skill says "publish to the issue tracker"

Create a Linear issue via `save_issue` with `team: "LinearFB"`.

## When a skill says "fetch the relevant ticket"

Run `get_issue` with the issue identifier (e.g. `LIN-38`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with child (sub) issues as tickets.

- **Map**: a single issue labelled with a custom `wayfinder:map` label, holding the Notes / Decisions-so-far / Fog body. Create via `save_issue` with `team: "LinearFB"`.
- **Child ticket**: a sub-issue linked via `parentId` pointing at the map issue. Labels: custom `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, assigned to the driving dev.
- **Blocking**: Use `blocks` / `blockedBy` fields on `save_issue` to express dependency edges. A ticket is unblocked when every blocker is completed.
- **Frontier query**: `list_issues` filtered to the map's sub-issues (by `parentId`), drop any with open blockers or an assignee; first in creation order wins.
- **Claim**: `save_issue` with `id` and `assignee: "me"`.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state: "Done"`, then append a context pointer to the map body via `save_issue` with `patch`.
