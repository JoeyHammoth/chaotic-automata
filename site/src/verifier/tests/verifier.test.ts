import { describe, expect, it } from 'vitest';

import {
  certificateSummary,
  checkSummary,
  cryptidSummary,
  formatSteps,
  residue,
  verdictBadge,
  type Cryptid,
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
    ...over,
  };
}

describe('cryptids', () => {
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

describe('the residue', () => {
  it('adds undecided and heuristic machines across the runs without merging them', () => {
    const total = residue([run({ undecided: 7, heuristic: 2 }), run({ undecided: 3, heuristic: 1 })]);
    expect(total.undecided).toBe(10);
    expect(total.heuristic).toBe(3);
    expect(total.machines).toBe(20);
  });
});
