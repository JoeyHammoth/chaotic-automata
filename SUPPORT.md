# Support

Where to take a question, and what to expect back. This is a single-maintainer project: help is best
effort, and there is no service-level promise.

## Choose the right route

| You have | Go to |
|---|---|
| A bug: something broke, hung, or showed nothing | [Open a bug report](https://github.com/JoeyHammoth/chaotic-automata/issues/new?template=bug_report.yml) |
| A feature request or a question about scope | [Open a feature request](https://github.com/JoeyHammoth/chaotic-automata/issues/new?template=feature_request.yml) |
| A usage question: "how do I read this metric?" | [Open an issue](https://github.com/JoeyHammoth/chaotic-automata/issues/new) labelled `question` |
| A wrong constant, metric or citation | Open an issue with the claim, the primary source and the correction (see [`CONTRIBUTING.md`](CONTRIBUTING.md)) |
| A suspected vulnerability | Private reporting via the **Security** tab, never a public issue (see [`SECURITY.md`](SECURITY.md)) |
| A conduct problem | The private routes in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

GitHub Discussions are not enabled; issues are the single queue, so a question and its answer stay
searchable in one place.

## What to include

- **Which page**: the URL of the page, including any `?rule=` parameters, or the commit you built.
- **What you expected and what happened**, in one sentence each.
- **The smallest reproduction**: a rule string, a seed, a click path. A reproducer that takes ten
  seconds to run gets answered first.
- **Environment**: browser and version for the site, OS and toolchain versions for a local build.

## What to expect

- A first reply is best effort. There is no guaranteed response time.
- Triaged issues carry one `area:` label, one `kind:` label and one `priority:` label, so you can see
  where something sits; see [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
- Fixes land on `main` through a pull request that runs the same checks the repository documents.

If an issue has gone quiet, a polite ping on the thread is welcome. Re-reporting something that was
never answered is not rude; it is how a backlog gets noticed.
