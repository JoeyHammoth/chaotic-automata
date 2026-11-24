// The Verifier product: what the page is allowed to draw. The product is produced by
// `python -m computation_atlas.verifier`; the page never re-derives a verdict, so a class shown on
// screen is the class the pipeline recorded, and an undecided machine can never be drawn as a
// non-halting one.

export interface Certificate {
  kind: 'halts' | 'cycle' | 'translation';
  decider?: string;
  start?: number;
  period?: number;
  shift?: number;
  span?: number;
  steps?: number;
}

export interface Mutation {
  label: string;
  certificate: Certificate;
  accepted: boolean;
  reason: string;
}

export interface Labelled {
  string: string;
  states: number;
  /** The decider that fired, or `halts`, `heuristic`, `undecided`. */
  verdict: string;
  steps: number;
  certificate: Certificate | null;
  checker: 'accepted' | 'refused' | null;
  reason: string | null;
  mutations: Mutation[];
}

export interface Run {
  states: number;
  quoted: number | null;
  reproduced: number | null;
  champion: string | null;
  machines: number;
  halting: number;
  certified: number;
  cycler: number;
  bouncer: number;
  translated: number;
  heuristic: number;
  undecided: number;
}

export interface Claim {
  text: string;
  source: string;
  verified: boolean;
}

export interface Champion {
  string: string;
  steps: number | null;
  quoted: number;
  halted: boolean;
  source: string;
}

export interface CryptidSample {
  steps: number;
  span: number;
  drift: number;
}

export interface CryptidTrace {
  halted: boolean;
  steps: number;
  samples: CryptidSample[];
}

export interface Cryptid {
  name: string;
  string: string;
  states: number;
  domain: string;
  /** What the wiki says about it, in the wiki's own words. */
  claim: string;
  found: string;
  note: string;
  source: string;
  verdict: string;
  steps: number;
  halted: boolean;
  /** How wide the written tape got inside the cap. */
  span: number;
  certificate: Certificate | null;
  checker: 'accepted' | 'refused' | null;
  reason: string | null;
  /** A million-step walk on the array tape: still not a verdict, but the shape of the walk. */
  trace: CryptidTrace;
}

export interface VerifierProduct {
  version: number;
  generated_by: string;
  seed: number;
  cap: number;
  check_every: number;
  heuristic_span: number;
  bouncer_span: number;
  machine_format: string;
  runs: Run[];
  champion: Champion;
  labelled: Labelled[];
  cryptids: Cryptid[];
  claims: Claim[];
}

export type VerdictClass = 'halts' | 'certified' | 'heuristic' | 'undecided';

export interface VerdictBadge {
  className: VerdictClass;
  symbol: string;
  text: string;
}

/** A verdict as the page must show it: a symbol and words, so colour is never the only cue. */
export function verdictBadge(verdict: string): VerdictBadge {
  if (verdict === 'halts') return { className: 'halts', symbol: '●', text: 'halts' };
  if (verdict === 'undecided') {
    return { className: 'undecided', symbol: '▲', text: 'undecided — not non-halting' };
  }
  if (verdict === 'heuristic') {
    return { className: 'heuristic', symbol: '■', text: 'heuristic — the checker refused this guess' };
  }
  return { className: 'certified', symbol: '◆', text: `certified non-halting · ${verdict}` };
}

/**
 * What this pipeline can say about a cryptid: its own verdict inside the cap, and nothing more. The
 * row is worded so a reader cannot mistake a 256-step guess for a claim about the machine.
 */
export function cryptidSummary(cryptid: Cryptid): { verdict: string; proves: string } {
  const guess = cryptid.certificate === null ? 'a guess with no certificate' : 'a certificate';
  return {
    verdict: `${cryptid.verdict} after ${cryptid.steps} steps (${guess})`,
    proves:
      'nothing about halting: the cap is 256 steps and this machine is quoted precisely because ' +
      'nobody knows whether it halts',
  };
}

/**
 * The growth of a cryptid's written tape, sampled over the long run. A reader can see that the span
 * keeps growing without a repeat, which is the whole reason the machine is a cryptid — and it is
 * still not a proof that it never halts.
 */
export function cryptidTraceLine(trace: CryptidTrace): string {
  const steps = trace.steps.toLocaleString('en-US');
  if (trace.halted) return `halted at step ${steps}`;
  if (trace.samples.length === 0) return `no halt in ${steps} steps`;
  const points = trace.samples
    .map((sample) => `${sample.span.toLocaleString('en-US')} at ${sample.steps.toLocaleString('en-US')}`)
    .join(', ');
  return `no halt in ${steps} steps; span ${points}`;
}

export function formatSteps(steps: number | null): string {
  if (steps === null) return 'did not halt inside the cap';
  return steps.toLocaleString('en-US');
}

export function certificateSummary(certificate: Certificate | null): string {
  if (certificate === null) return 'no certificate';
  if (certificate.kind === 'halts') return `halts at step ${formatSteps(certificate.steps ?? null)}`;
  if (certificate.kind === 'cycle') {
    return `repeats every ${certificate.period} steps from step ${certificate.start}`;
  }
  return `repeats every ${certificate.period} steps up to a shift of ${certificate.shift}`;
}

/** The undecided residue is the headline, not a footnote: it is the number the page leads with. */
export function residue(runs: Run[]): { undecided: number; heuristic: number; machines: number } {
  return runs.reduce(
    (total, run) => ({
      undecided: total.undecided + run.undecided,
      heuristic: total.heuristic + run.heuristic,
      machines: total.machines + run.machines,
    }),
    { undecided: 0, heuristic: 0, machines: 0 },
  );
}

export function checkSummary(labelled: Labelled): string {
  if (labelled.certificate === null) return 'nothing to check: no certificate was offered';
  const verdict = labelled.checker === 'accepted' ? 'accepted' : 'refused';
  return `${verdict} — ${labelled.reason ?? 'no reason recorded'}`;
}

export async function loadVerifier(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifierProduct> {
  const response = await fetchImpl(`${base}products/verifier/manifest.json`);
  if (!response.ok) throw new Error(`the verifier product is missing (${response.status})`);
  return (await response.json()) as VerifierProduct;
}
