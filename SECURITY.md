# Security policy

## Supported versions

`main` is the only supported line. Previews and data products built before a merge are not.

| Version | Supported |
|---|---|
| `main` (0.1.x) | Yes |
| Earlier milestone snapshots, preview products | No |

## Reporting a vulnerability

**Do not open a public issue for a suspected vulnerability.** Use GitHub's private
reporting: repository **Security** tab -> **Report a vulnerability**. That goes only to the
maintainer and creates a private advisory where the fix can be discussed.

A useful report contains:

- what the problem is and where (file, URL, commit),
- the smallest input that triggers it,
- what an attacker gains that they should not,
- the browser or platform, if it only reproduces there.

## What is in scope

- **Memory safety or unsound behaviour in the Rust engines** (`crates/`), including anything that
  crosses the WebAssembly boundary: out-of-bounds reads, panics reachable from a page, a rule or
  pattern string that escapes the intended allocation budget.
- **Hostile input in the site**: a crafted rule string, URL parameter, RLE or macrocell import, or a
  malformed data product that crashes the page, hangs the tab, or freezes the UI instead of failing
  with a message.
- **Supply chain**: a pinned dependency, npm package or GitHub Actions ref that can be swapped or
  hijacked, or a build step that would execute unreviewed code with repository credentials.

## What is out of scope

- **Scientific accuracy.** A wrong metric, a misquoted constant or a class that looks wrong is a bug,
  not a vulnerability; see "Reporting a scientific error" in [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Self-inflicted denial of service.** Running an expensive rule in your own tab is expected: the
  site is client-side and has no server to exhaust.
- **GitHub Pages platform behaviour** (headers, redirects, TLS), which this project does not control.
- **Reports from automated scanners with no reachable impact.**

## Response

This is a single-maintainer project, so response is best effort, without a bug bounty:

- acknowledgement within 7 days,
- an assessment (fix, mitigate, or explain why it is not a vulnerability) within 30 days,
- a GitHub security advisory published once a fix is merged, with credit unless you prefer not.

Please give the maintainer a reasonable window before public disclosure.
