# Labels

The engineering skills speak in five canonical triage roles. This file maps those roles to the label
strings used in this repo, and records the other label axes.

## Triage roles

| Role in the skills | Label in this tracker | Meaning |
|---|---|---|
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this |
| `needs-info` | `needs-info` | Waiting on the author for information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, safe for an autonomous agent |
| `ready-for-human` | `ready-for-human` | Needs a human: judgement, credentials, or taste |
| `wontfix` | `wontfix` | Will not be actioned |

## Area

One per issue, matching a module or the platform: `area:atlas`, `area:inspector`, `area:hashlife`,
`area:stress-lab`, `area:forge`, `area:verifier`, `area:heritage`, `area:platform`, `area:docs`.

## Kind

`kind:research` (reading and verification), `kind:spike` (throwaway probe that answers a question),
`kind:feature` (shipped behaviour), `kind:docs`, `kind:infra`, `kind:decision` (the deliverable is a
recorded choice, not code).

## Priority

`priority:p0` blocks the spine from advancing; `priority:p1` belongs to the current milestone;
`priority:p2` is queued, not scheduled.

Apply one triage label, one `area:` label, one `kind:` label and one `priority:` label to every
issue. The project board's `Module` field mirrors `area:`; keep them in agreement.
