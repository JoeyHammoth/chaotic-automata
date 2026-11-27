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
  /** Span gained since the previous sample: where the growth is, decade by decade. */
  delta?: number;
}

export interface CryptidTrace {
  halted: boolean;
  steps: number;
  samples: CryptidSample[];
}

/** One machine in the mirror's longer run, from `python -m computation_atlas.cryptid_ladder`. */
export interface LadderMachine extends CryptidTrace {
  name: string;
  string: string;
}

/**
 * The 10^10 ladder: the same four walks one decade past the product's budget, run by
 * `crates/ca-cryptid`. It sits beside the product and never replaces it — the producer's own 10^9
 * samples are what the chart's solid points are.
 */
export interface CryptidLadder {
  version: number;
  generated_by: string;
  command: string;
  steps: number;
  samples: number[];
  machines: LadderMachine[];
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
  /** A billion-step walk on the array tape: still not a verdict, but the shape of the walk. */
  trace: CryptidTrace;
}

export interface VerifierProduct {
  version: number;
  generated_by: string;
  seed: number;
  cap: number;
  /** The trace budget: a billion transitions, recorded so the chart can say so. */
  cryptid_steps?: number;
  cryptid_samples?: number[];
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

/**
 * What the longer run adds: one decade, and the span gained in it. Worded so a reader cannot take the
 * mirror's run for a verdict, or the product's 10^9 for the whole of it.
 */
export function cryptidLadderLine(trace: CryptidTrace, ladder: CryptidTrace): string {
  if (ladder.halted) {
    return (
      `The mirror halted it at step ${ladder.steps.toLocaleString('en-US')}, ` +
      `past the product's budget`
    );
  }
  const last = ladder.samples[ladder.samples.length - 1];
  if (last === undefined) {
    return `The mirror walked ${ladder.steps.toLocaleString('en-US')} steps and recorded no growth`;
  }
  const previous = ladder.samples[ladder.samples.length - 2];
  const delta = last.delta ?? last.span - (previous?.span ?? 0);
  return (
    `The mirror carries the same walk to ${last.steps.toLocaleString('en-US')} steps — span ` +
    `${last.span.toLocaleString('en-US')}, +${delta.toLocaleString('en-US')} in the last decade — ` +
    `and agrees with the product through ${trace.steps.toLocaleString('en-US')} steps`
  );
}

export interface TracePoint {
  x: number;
  y: number;
  steps: number;
  span: number;
  /** True when only the mirror's longer run reaches this point. */
  mirror?: boolean;
}

export interface TraceChart {
  points: TracePoint[];
  maxSpan: number;
  /** The words the chart carries for a reader who cannot see it. */
  label: string;
}

/**
 * One trace point in words: the span at a step. The chart's label and each point's hover title both
 * use this sentence, so a pointer and a reader get the same numbers.
 */
export function tracePointLine(point: Pick<TracePoint, 'steps' | 'span'>): string {
  return (
    `${point.span.toLocaleString('en-US')} cells at ` +
    `${point.steps.toLocaleString('en-US')} steps`
  );
}

/**
 * Steps across on a log axis, span up.
 *
 * A log axis is the honest one — the samples are decades apart, so on a linear axis all but the
 * last two points pile up against the left edge. The chart carries its numbers in an aria-label and the
 * sentence stays beside it, so the picture is an addition to the words, never a replacement.
 */
function geometry(
  samples: CryptidSample[],
  width: number,
  height: number,
): {
  points: TracePoint[];
  maxSpan: number;
  first: CryptidSample | undefined;
  last: CryptidSample | undefined;
} {
  const usable = samples.filter((sample) => sample.steps > 0);
  const maxSpan = Math.max(1, ...usable.map((sample) => sample.span));
  const first = usable[0];
  const last = usable[usable.length - 1];
  const low = Math.log10(first?.steps ?? 1);
  const high = Math.log10(last?.steps ?? 1);
  const decades = high - low || 1;
  const points = usable.map((sample) => ({
    x: 4 + ((Math.log10(sample.steps) - low) / decades) * (width - 8),
    y: height - 6 - (sample.span / maxSpan) * (height - 12),
    steps: sample.steps,
    span: sample.span,
  }));
  return { points, maxSpan, first, last };
}

/** The steepest decade, so the picture says where the growth is and not only that there is some. */
function fastestDecade(
  samples: CryptidSample[],
): { from: number; to: number; delta: number } | null {
  return samples.slice(1).reduce<{ from: number; to: number; delta: number } | null>(
    (best, sample, index) => {
      const previous = samples[index] as CryptidSample;
      const delta = sample.delta ?? sample.span - previous.span;
      return best === null || delta > best.delta
        ? { from: previous.steps, to: sample.steps, delta }
        : best;
    },
    null,
  );
}

function chartLabel(
  first: CryptidSample | undefined,
  last: CryptidSample | undefined,
  fastest: { from: number; to: number; delta: number } | null,
  steps: number,
  extra = '',
): string {
  if (first === undefined || last === undefined) {
    return `no growth recorded over ${steps.toLocaleString('en-US')} steps`;
  }
  return (
    `span grows from ${first.span.toLocaleString('en-US')} cells at ` +
    `${first.steps.toLocaleString('en-US')} steps to ${last.span.toLocaleString('en-US')} at ` +
    `${last.steps.toLocaleString('en-US')} steps` +
    extra +
    (fastest === null || fastest.delta <= 0
      ? ''
      : `; the span grows fastest between ${fastest.from.toLocaleString('en-US')} and ` +
        `${fastest.to.toLocaleString('en-US')} steps (+${fastest.delta.toLocaleString('en-US')})`)
  );
}

export function cryptidTraceChart(trace: CryptidTrace, width = 132, height = 44): TraceChart {
  const { points, maxSpan, first, last } = geometry(trace.samples, width, height);
  const label = chartLabel(first, last, fastestDecade(trace.samples), trace.steps);
  return { points, maxSpan, label };
}

/**
 * The product's chart with the mirror's decade added: its own samples as they are, then the point only
 * the longer run reaches, flagged so the page can draw it hollow.
 */
export function cryptidLadderChart(
  trace: CryptidTrace,
  ladder: CryptidTrace | undefined,
  width = 132,
  height = 44,
): TraceChart {
  const product = trace.samples.filter((sample) => sample.steps > 0);
  const beyond = (ladder?.samples ?? []).filter((sample) => sample.steps > trace.steps);
  const samples = [...product, ...beyond];
  const { points, maxSpan, first, last } = geometry(samples, width, height);
  const mirrored = points.map((point, index) => ({ ...point, mirror: index >= product.length }));
  const extra = beyond.length
    ? `; the last point is the mirror's longer run, which agrees with the product through ` +
      `${trace.steps.toLocaleString('en-US')} steps`
    : '';
  const label = chartLabel(first, last, fastestDecade(samples), trace.steps, extra);
  return { points: mirrored, maxSpan, label };
}

export interface GrowthBar {
  /** The decade the bar covers. */
  from: number;
  to: number;
  /** Span gained across that decade. */
  delta: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when only the mirror's longer run reaches this decade. */
  mirror: boolean;
}

export interface GrowthChart {
  bars: GrowthBar[];
  maxDelta: number;
  /** The words the chart carries for a reader who cannot see it. */
  label: string;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US')}`;
}

/**
 * One decade's gain in words: the chart's label, each bar's hover title and the unit tests all use
 * this sentence, so a pointer, a screen reader and the paragraph cannot quote different numbers.
 */
export function growthBarLine(bar: Pick<GrowthBar, 'from' | 'to' | 'delta'>): string {
  return (
    `${formatSigned(bar.delta)} from ${bar.from.toLocaleString('en-US')} ` +
    `to ${bar.to.toLocaleString('en-US')}`
  );
}

/**
 * The span gained in each decade, as bars.
 *
 * The line chart says the walk keeps spreading; this says how much it gained where, which is what
 * separates a walk still accelerating at the end of the budget from one that has settled. A decade
 * that gained nothing is a bar of zero height rather than an omitted bar, and a negative gain is
 * drawn at zero but still spoken in the label, because losing ground is a measurement too.
 */
export function cryptidGrowthChart(
  trace: CryptidTrace,
  ladder: CryptidTrace | undefined,
  width = 132,
  height = 44,
): GrowthChart {
  const product = trace.samples.filter((sample) => sample.steps > 0);
  const beyond = (ladder?.samples ?? []).filter((sample) => sample.steps > trace.steps);
  const samples = [...product, ...beyond];
  const gains = samples.slice(1).map((sample, index) => {
    const previous = samples[index] as CryptidSample;
    return {
      from: previous.steps,
      to: sample.steps,
      delta: sample.delta ?? sample.span - previous.span,
      mirror: index + 1 >= product.length,
    };
  });
  const maxDelta = Math.max(1, ...gains.map((gain) => gain.delta));
  const slot = (width - 4) / Math.max(1, gains.length);
  const bars = gains.map((gain, index) => {
    const barHeight = (Math.max(0, gain.delta) / maxDelta) * (height - 6);
    return {
      ...gain,
      x: 2 + index * slot,
      y: height - 2 - barHeight,
      width: Math.max(1, slot - 2),
      height: barHeight,
    };
  });
  const label =
    gains.length === 0
      ? `no decade to compare over ${trace.steps.toLocaleString('en-US')} steps`
      : 'span gained per decade: ' + gains.map(growthBarLine).join(', ');
  return { bars, maxDelta, label };
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

/**
 * The longer run, if it is there. Its absence costs the page one sentence, not the product: the
 * 10^9 chart is drawn either way.
 */
export async function loadLadder(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CryptidLadder | null> {
  const response = await fetchImpl(`${base}products/verifier/cryptid-ladder.json`);
  if (!response.ok) return null;
  return (await response.json()) as CryptidLadder;
}
