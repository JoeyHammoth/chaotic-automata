# Issue tracker: GitHub

Issues, specs and ways of working for this repo live as GitHub issues in
`JoeyHammoth/chaotic-automata`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**:
  `gh issue create --title "..." --label "area:atlas,ready-for-agent" --milestone "M1 · Atlas"`.
  Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels`.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or
  `gh issue edit <parent> --add-sub-issue <child>`.
- **Blocking**: GitHub's native issue dependencies, which render in the UI.
  `gh issue create --blocked-by <n>,<n>` or `gh issue edit <child> --add-blocked-by <blocker>`.
  A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/{owner}/{repo}/issues/<n> --jq .issue_dependencies_summary.blocked_by`
  (0 means startable).
- **Comment**: `gh issue comment <number> --body "..."`.
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: comment the reason, then `gh issue close <number>`. Closing without a reason loses the
  decision.

## Milestones

Milestones are the module milestones (`M0 · Foundations` … `M5 · Signature module`, `M6`, `M7`). A
milestone is a delivery boundary, not a queue; the project board is the queue.

## Project board

The board (`Computation Atlas v2`) mirrors the issue graph. Items are issues and PRs; fields are
`Module` (single select) and `Priority` (single select). Never create a board item for work that has
no issue.

## Pull requests as a request surface

**PRs as a request surface: no.** PRs are implementation review, not feature requests. Feature
requests arrive as issues.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue labelled `wayfinder:map`; its tickets are child
issues.

- **Map**: `gh issue create --label wayfinder:map`.
- **Child ticket**: sub-issue of the map, labelled `wayfinder:<type>`
  (`research` / `prototype` / `grilling` / `task`). Once claimed, assigned to the driving dev.
- **Blocking**: native issue dependencies (see above).
- **Frontier query**: list the map's open children, drop any with an open blocker or an assignee;
  first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` before any work.
- **Resolve**: post the answer as a comment, close the issue, append a gist and link to the map's
  Decisions-so-far section.
