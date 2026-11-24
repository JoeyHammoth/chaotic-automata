import { describe, expect, it } from 'vitest';

import {
  certificateSummary,
  checkSummary,
  formatSteps,
  residue,
  verdictBadge,
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

describe('the residue', () => {
  it('adds undecided and heuristic machines across the runs without merging them', () => {
    const total = residue([run({ undecided: 7, heuristic: 2 }), run({ undecided: 3, heuristic: 1 })]);
    expect(total.undecided).toBe(10);
    expect(total.heuristic).toBe(3);
    expect(total.machines).toBe(20);
  });
});
