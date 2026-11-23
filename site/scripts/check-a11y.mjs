// The accessibility gate: design doc 7.8 budgets Lighthouse accessibility at >= 95, and until now
// nothing failed the build when the page lost it.
//
// Two things this checks that a bare `score >= 0.95` would not. A page that fails to boot also scores
// 100, because missing markup gives the rules nothing to object to, so a report with too few scored
// audits is treated as a broken run rather than a pass. Run warnings mean Lighthouse could not audit
// something it intended to, which is the same silent-pass problem one level down.
//
// A score is also a sum, and a sum absorbs a small defect: `landmark-one-main` weighs 3 of a few
// hundred points, so a page that loses its `<main>` still scores in the high nineties and passes
// (#65). Every scored failure is therefore its own gate failure, and the threshold stays behind it
// as a backstop for a regression spread thinly across many audits.
import { readFileSync } from 'node:fs';

const THRESHOLD = 0.95;
const MIN_SCORED_AUDITS = 20;

const [path] = process.argv.slice(2);
if (!path) {
  console.error('usage: check-a11y.mjs <lighthouse-report.json>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(path, 'utf8'));
const category = report.categories?.accessibility;
if (!category) {
  console.error('a11y: the report has no accessibility category');
  console.error('a11y: measure with `lighthouse <url> --only-categories=accessibility --output=json`');
  process.exit(2);
}

const scored = category.auditRefs
  .map((ref) => ({ id: ref.id, weight: ref.weight, audit: report.audits[ref.id] }))
  .filter((entry) => typeof entry.audit?.score === 'number');

const failing = scored.filter((entry) => entry.audit.score < 1).sort((a, b) => b.weight - a.weight);

console.log(
  `Lighthouse ${report.lighthouseVersion}: accessibility scored over ${scored.length} audits` +
    (typeof category.score === 'number' ? ` = ${Math.round(category.score * 100)}` : ' = not scored'),
);
for (const entry of failing) {
  console.log(`  FAIL ${entry.id} (weight ${entry.weight}): ${entry.audit.title}`);
  for (const item of (entry.audit.details?.items ?? []).slice(0, 5)) {
    const where = item.node?.selector ?? item.node?.snippet ?? JSON.stringify(item);
    console.log(`    ${String(where).slice(0, 200)}`);
  }
}

const problems = [];
for (const entry of failing) {
  problems.push(
    `audit ${entry.id} (weight ${entry.weight}) failed: ${entry.audit.title}`,
  );
}
if (typeof category.score !== 'number') {
  problems.push('the accessibility category was not scored');
} else if (category.score < THRESHOLD) {
  problems.push(
    `score ${Math.round(category.score * 100)} is below the ${Math.round(THRESHOLD * 100)} budget`,
  );
}
if (scored.length < MIN_SCORED_AUDITS) {
  problems.push(
    `only ${scored.length} audits were scored, under the ${MIN_SCORED_AUDITS} expected: the page did not render a full document`,
  );
}
// Lighthouse warns that the tested device has a slower CPU than its throttling model assumes. That
// describes the machine, not whether the audits ran, and it fires on shared CI runners, so it is not
// a gate failure. Every other warning means a gatherer did not do its job and the score covers less
// than it claims to, which is exactly the silent-pass case this gate exists to catch.
const benignWarnings = [/slower CPU than\s+Lighthouse expects/i, /CPU slowdown multiplier/i];
for (const warning of report.runWarnings ?? []) {
  if (benignWarnings.some((pattern) => pattern.test(warning))) continue;
  problems.push(`run warning: ${warning}`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`a11y: ${problem}`);
  process.exit(1);
}
console.log(`a11y: passes the >= ${Math.round(THRESHOLD * 100)} budget`);
