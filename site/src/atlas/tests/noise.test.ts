import { describe, expect, it } from 'vitest';
import {
  bracket,
  epsFromStep,
  formatEpsilon,
  isCollapsed,
  overlayColour,
  overlayLegend,
  overlayNote,
  sampleScores,
  type NoiseAnchor,
  type NoiseManifest,
} from '../lib/noise';

const anchors: NoiseAnchor[] = [
  { num: 0, den: 1, eps: 0, path: 'a.bin', bytes: 4, collapsed_fraction: 0.5, sha256: '' },
  { num: 1, den: 64, eps: 1 / 64, path: 'b.bin', bytes: 4, collapsed_fraction: 0.6, sha256: '' },
  { num: 1, den: 8, eps: 1 / 8, path: 'c.bin', bytes: 4, collapsed_fraction: 0.9, sha256: '' },
];

const manifest: NoiseManifest = {
  version: 1,
  kind: 'noise-overlay',
  generator: 'python -m computation_atlas.noise',
  chart: 512,
  sample: 4,
  grid: 2,
  lattice: 16,
  steps: 24,
  soup_seed: 11,
  noise_seed: 23,
  slider_unit: 1024,
  threshold: 0.1,
  statistic: 'excess neighbour agreement',
  note: '',
  anchors,
};

describe('bracket', () => {
  it('clamps below the first level and above the last', () => {
    expect(bracket(anchors, 0)).toEqual([0, 0, 0]);
    expect(bracket(anchors, -1)).toEqual([0, 0, 0]);
    expect(bracket(anchors, 1)).toEqual([2, 2, 0]);
  });

  it('finds the pair that surrounds a level and the fraction between them', () => {
    const [low, high, t] = bracket(anchors, 1 / 128);
    expect(low).toBe(0);
    expect(high).toBe(1);
    expect(t).toBeCloseTo(0.5, 12);
  });

  it('returns an exact level without interpolating', () => {
    expect(bracket(anchors, 1 / 64)).toEqual([1, 1, 0]);
  });
});

describe('sampleScores', () => {
  const levels = [new Uint8Array([0, 255]), new Uint8Array([128, 64]), new Uint8Array([255, 0])];

  it('returns the stored level unchanged at an anchor', () => {
    const scores = sampleScores(levels, anchors, 1 / 64);
    expect(scores[0]).toBeCloseTo(128 / 255, 6);
    expect(scores[1]).toBeCloseTo(64 / 255, 6);
  });

  it('interpolates linearly between two levels', () => {
    const scores = sampleScores(levels, anchors, 1 / 128);
    expect(scores[0]).toBeCloseTo(64 / 255, 6);
    expect(scores[1]).toBeCloseTo((255 + 64) / 2 / 255, 6);
  });

  it('clamps outside the stored range instead of extrapolating', () => {
    const low = sampleScores(levels, anchors, 0);
    const high = sampleScores(levels, anchors, 1);
    expect(low[0]).toBe(0);
    expect(high[0]).toBe(1);
  });

  it('is empty when there is nothing to read', () => {
    expect(sampleScores([], anchors, 0).length).toBe(0);
  });
});

describe('threshold and legend', () => {
  it('calls a sample collapsed strictly below the threshold', () => {
    expect(isCollapsed(0.09, 0.1)).toBe(true);
    expect(isCollapsed(0.1, 0.1)).toBe(false);
  });

  it('names the threshold in both legend entries and hatches the collapsed one', () => {
    const items = overlayLegend(manifest);
    expect(items).toHaveLength(2);
    expect(items[0]?.label).toContain('0.10');
    expect(items[1]?.label).toContain('0.10');
    expect(items[1]?.hatched).toBe(true);
  });

  it('states where the numbers came from', () => {
    const note = overlayNote(manifest);
    expect(note).toContain('512×512');
    expect(note).toContain('16×16');
    expect(note).toContain('11');
    expect(note).toContain('23');
  });
});

describe('formatting', () => {
  it('prints dyadic rates as fractions and keeps exact ones', () => {
    expect(formatEpsilon(0)).toBe('0');
    expect(formatEpsilon(1 / 64)).toBe('1/64 = 0.0156');
    expect(epsFromStep(16, 1024)).toBe(1 / 64);
  });

  it('brightens with structure and clamps outside the unit interval', () => {
    const dark = overlayColour(0);
    const bright = overlayColour(1);
    expect(dark[1]).toBeLessThan(bright[1]);
    expect(overlayColour(2)).toEqual(bright);
    expect(overlayColour(-1)).toEqual(dark);
  });
});
