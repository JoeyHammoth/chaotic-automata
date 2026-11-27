import { describe, expect, it } from 'vitest';

import {
  certificateSummary,
  checkSummary,
  cryptidGrowthChart,
  cryptidLadderChart,
  cryptidLadderLine,
  cryptidSummary,
  cryptidTraceChart,
  cryptidTraceLine,
  formatSteps,
  growthBarLine,
  residue,
  verdictBadge,
  type Cryptid,
  type CryptidTrace,
  type Labelled,
  type Run,
} from '../lib/verifier';

function run(over: Partial<Run>): Run {
  return {
    states: 2,
    quoted: 6,
    reproduced: 6,
    champion: null,
    machines: 10,
    halting: 5,
    certified: 3,
    cycler: 1,
    bouncer: 1,
    translated: 2,
    heuristic: 1,
    undecided: 1,
    ...over,
  };
}

function labelled(over: Partial<Labelled>): Labelled {
  return {
    string: '1RB1LB_1LA---',
    states: 2,
    verdict: 'halts',
    steps: 6,
    certificate: { kind: 'halts', steps: 6 },
    checker: 'accepted',
    reason: 'replayed 6 steps and the machine halted there',
    mutations: [],
    ...over,
  };
}

describe('verdict badges', () => {
  it('gives each class its own symbol and words, so colour is never the only cue', () => {
    const badges = ['halts', 'cycler', 'translated cycler', 'heuristic', 'undecided'].map(
      verdictBadge,
    );
    const symbols = new Set(badges.map((badge) => badge.symbol));
    expect(symbols.size).toBe(4);
    for (const badge of badges) expect(badge.text.length).toBeGreaterThan(0);
  });

  it('calls every decider certified, and never calls a guess certified', () => {
    expect(verdictBadge('cycler').className).toBe('certified');
    expect(verdictBadge('translated cycler').className).toBe('certified');
    expect(verdictBadge('heuristic').className).toBe('heuristic');
    expect(verdictBadge('heuristic').text).toContain('refused');
    expect(verdictBadge('undecided').text).toContain('not non-halting');
  });
});

describe('formatting', () => {
  it('groups the champion step count and never prints a null as zero', () => {
    expect(formatSteps(47_176_870)).toBe('47,176,870');
    expect(formatSteps(null)).toBe('did not halt inside the cap');
  });

  it('summarises each certificate kind', () => {
    expect(certificateSummary(null)).toBe('no certificate');
    expect(certificateSummary({ kind: 'halts', steps: 6 })).toContain('halts at step 6');
    expect(certificateSummary({ kind: 'cycle', start: 4, period: 2 })).toContain(
      'every 2 steps from step 4',
    );
    expect(certificateSummary({ kind: 'translation', start: 8, period: 4, shift: 3 })).toContain(
      'shift of 3',
    );
  });

  it('says when there was nothing to check', () => {
    expect(checkSummary(labelled({ certificate: null, checker: null }))).toContain(
      'nothing to check',
    );
    expect(checkSummary(labelled({ checker: 'refused', reason: 'the state differs' }))).toContain(
      'refused',
    );
  });
});

function cryptid(over: Partial<Cryptid>): Cryptid {
  return {
    name: 'Antihydra',
    string: '1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA',
    states: 6,
    domain: 'BB(6)',
    claim: 'probviously non-halting',
    found: 'Jun 2024, mxdys',
    note: '',
    source: 'https://wiki.bbchallenge.org/wiki/Cryptids',
    verdict: 'heuristic',
    steps: 256,
    halted: false,
    span: 24,
    certificate: null,
    checker: null,
    reason: null,
    trace: {
      halted: false,
      steps: 1_000_000,
      samples: [
        { steps: 1_000, span: 30, drift: 12 },
        { steps: 1_000_000, span: 1_554, drift: 1_038 },
      ],
    },
    ...over,
  };
}

describe('cryptids', () => {
  it('charts the growth on a log axis, with the numbers in words', () => {
    const chart = cryptidTraceChart(cryptid({}).trace);
    expect(chart.points).toHaveLength(2);
    // Later samples are further right, and more span is higher up (smaller y).
    expect(chart.points[0]!.x).toBeLessThan(chart.points[1]!.x);
    expect(chart.points[0]!.y).toBeGreaterThan(chart.points[1]!.y);
    expect(chart.label).toContain('1,554 at 1,000,000');
    expect(chart.label).not.toContain('proved');
  });

  it('reports the long run as growth rather than as a verdict', () => {
    const line = cryptidTraceLine(cryptid({}).trace);
    expect(line).toContain('no halt in 1,000,000 steps');
    expect(line).toContain('1,554 at 1,000,000');
    expect(line).not.toContain('proved');
  });

  it('reports the guess and says in the same breath that it proves nothing', () => {
    const summary = cryptidSummary(cryptid({}));
    expect(summary.verdict).toContain('heuristic after 256 steps');
    expect(summary.verdict).toContain('no certificate');
    expect(summary.proves).toContain('nothing about halting');
    expect(summary.proves).toContain('256');
  });

  it('does not call a halted cryptid decided either', () => {
    // If a quoted machine ever halted inside the cap the row must still not read as a verdict about
    // the open problem; the wording is the same because the claim is about the cap.
    const summary = cryptidSummary(cryptid({ verdict: 'halts', halted: true, steps: 12 }));
    expect(summary.proves).toContain('nothing about halting');
  });
});

describe("the mirror's longer run", () => {
  const ladder: CryptidTrace = {
    halted: false,
    steps: 10_000_000_000,
    samples: [
      ...cryptid({}).trace.samples,
      { steps: 10_000_000_000, span: 2_000, drift: 1_500, delta: 446 },
    ],
  };

  it('extends the chart one decade and marks the point only the mirror reaches', () => {
    const chart = cryptidLadderChart(cryptid({}).trace, ladder);
    expect(chart.points).toHaveLength(3);
    expect(chart.points.filter((point) => point.mirror)).toHaveLength(1);
    expect(chart.points[2]!.x).toBeGreaterThan(chart.points[1]!.x);
    expect(chart.label).toContain('2,000 at 10,000,000,000');
    expect(chart.label).toContain('mirror');
    expect(chart.label).toContain('agrees with the product through 1,000,000 steps');
    expect(chart.label).not.toContain('proved');
  });

  it('draws the product alone when the ladder is missing', () => {
    const chart = cryptidLadderChart(cryptid({}).trace, undefined);
    expect(chart.points).toHaveLength(2);
    expect(chart.points.every((point) => point.mirror !== true)).toBe(true);
    expect(chart.label).not.toContain('mirror');
  });

  it('says how much the last decade gained, and which run it belongs to', () => {
    const line = cryptidLadderLine(cryptid({}).trace, ladder);
    expect(line).toContain('10,000,000,000');
    expect(line).toContain('2,000');
    expect(line).toContain('+446');
    expect(line).toContain('agrees with the product through 1,000,000 steps');
    expect(line).not.toContain('proved');
  });

  it('does not turn a halt inside the longer budget into a verdict about the machine', () => {
    const line = cryptidLadderLine(cryptid({}).trace, { halted: true, steps: 5_000, samples: [] });
    expect(line).toContain('halted');
    expect(line).toContain('past the product');
    expect(line).not.toContain('proved');
  });
});

describe('span gained per decade', () => {
  const ladder: CryptidTrace = {
    halted: false,
    steps: 10_000_000_000,
    samples: [
      ...cryptid({}).trace.samples,
      { steps: 10_000_000_000, span: 2_000, drift: 1_500, delta: 446 },
    ],
  };

  it('draws one bar per decade, with the mirror\'s decade marked', () => {
    const chart = cryptidGrowthChart(cryptid({}).trace, ladder);
    expect(chart.bars.map((bar) => bar.delta)).toEqual([1_524, 446]);
    expect(chart.bars.map((bar) => bar.mirror)).toEqual([false, true]);
    // The bigger gain is the taller bar, and the bars sit side by side.
    expect(chart.bars[1]!.height).toBeLessThan(chart.bars[0]!.height);
    expect(chart.bars[1]!.x).toBeGreaterThan(chart.bars[0]!.x);
  });

  it('says every gain in words, and never calls growth a proof', () => {
    const chart = cryptidGrowthChart(cryptid({}).trace, ladder);
    expect(chart.label).toContain('span gained per decade');
    expect(chart.label).toContain('+1,524 from 1,000 to 1,000,000');
    expect(chart.label).toContain('+446 from 1,000,000 to 10,000,000,000');
    expect(chart.label).not.toContain('proved');
  });

  it('names one decade the same way in the label and in the bar', () => {
    const bar = cryptidGrowthChart(cryptid({}).trace, ladder).bars[1]!;
    expect(growthBarLine(bar)).toBe('+446 from 1,000,000 to 10,000,000,000');
    expect(growthBarLine(bar)).toBe(
      cryptidGrowthChart(cryptid({}).trace, ladder).label.split(', ')[1],
    );
  });

  it('draws the product alone when the ladder is missing', () => {
    const chart = cryptidGrowthChart(cryptid({}).trace, undefined);
    expect(chart.bars).toHaveLength(1);
    expect(chart.bars[0]!.mirror).toBe(false);
    expect(chart.label).not.toContain('mirror');
  });
});

describe('the residue', () => {
  it('adds undecided and heuristic machines across the runs without merging them', () => {
    const total = residue([run({ undecided: 7, heuristic: 2 }), run({ undecided: 3, heuristic: 1 })]);
    expect(total.undecided).toBe(10);
    expect(total.heuristic).toBe(3);
    expect(total.machines).toBe(20);
  });
});
