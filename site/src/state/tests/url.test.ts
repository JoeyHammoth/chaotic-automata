import { describe, expect, it } from 'vitest';
import { readView, writeView } from '../index';
import { canonicalRule, parseRule } from '../../engine';

const base = new URL('https://example.test/atlas/');

describe('url state', () => {
  it('defaults to Life with seed 1', () => {
    const result = readView(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.canonical).toBe('B3/S23');
      expect(result.view.seed).toBe(1);
      expect(result.view.size).toBe(256);
    }
  });

  it('canonicalises the rule in the URL', () => {
    const result = readView(new URL('https://example.test/?rule=b36/s23&seed=9'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.canonical).toBe('B36/S23');
    expect(result.view.seed).toBe(9);
  });

  it('round-trips through writeView', () => {
    const rule = parseRule('B36/S23');
    const url = writeView(base, { rule, canonical: canonicalRule(rule), seed: 42, size: 128, steps: 12 });
    const result = readView(url);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.seed).toBe(42);
    expect(result.view.size).toBe(128);
    expect(result.view.canonical).toBe('B36/S23');
    expect(result.view.steps).toBe(12);
    expect(readView(base).ok && readView(base)).toMatchObject({ view: { steps: null } });
  });

  it('reports malformed rules instead of throwing', () => {
    const result = readView(new URL('https://example.test/?rule=B9/S23'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/out of range/);
  });

  it('rejects impossible steps', () => {
    const result = readView(new URL('https://example.test/?steps=1.5'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/steps/);
  });

  it('rejects impossible seeds and sizes', () => {
    const seed = readView(new URL('https://example.test/?seed=abc'));
    expect(seed.ok).toBe(false);
    const size = readView(new URL('https://example.test/?size=100'));
    expect(size.ok).toBe(false);
    if (!size.ok) expect(size.message).toMatch(/multiple of 64/);
  });
});
