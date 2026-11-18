import { describe, expect, it } from 'vitest';
import { readView, writeView, DEFAULT_CAMERA } from '../index';

const base = 'https://example.test/';

function read(search: string) {
  return readView(new URL(`${base}${search}`));
}

describe('readView', () => {
  it('defaults to Life, seed 1 and the class colouring', () => {
    const result = read('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.canonical).toBe('B3/S23');
    expect(result.view.seed).toBe(1);
    expect(result.view.metric).toBe('class');
    expect(result.view.disagreement).toBe(false);
    expect(result.view.camera).toEqual(DEFAULT_CAMERA);
  });

  it('canonicalises a lower-case rule', () => {
    const result = read('?rule=b3/s23');
    expect(result.ok && result.view.canonical).toBe('B3/S23');
  });

  it('reads the camera and layer', () => {
    const result = read('?metric=activity&x=100.5&y=200&z=4&dis=1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.metric).toBe('activity');
    expect(result.view.disagreement).toBe(true);
    expect(result.view.camera).toEqual({ x: 100.5, y: 200, zoom: 4 });
  });

  it('rejects a camera outside the chart', () => {
    expect(read('?x=600').ok).toBe(false);
    expect(read('?z=100').ok).toBe(false);
    expect(read('?z=abc').ok).toBe(false);
  });

  it('rejects a malformed rule visibly', () => {
    const result = read('?rule=B9/S23');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('out of range');
  });

  it('rejects a size that is not a multiple of 64', () => {
    expect(read('?size=100').ok).toBe(false);
  });
});

describe('writeView', () => {
  it('round-trips every part of the view', () => {
    const first = read('?rule=B36/S23&seed=7&metric=compression&dis=1&x=12&y=34&z=2.5');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const url = writeView(new URL(base), first.view);
    const second = readView(url);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.view).toEqual(first.view);
  });

  it('omits defaults so the canonical URL stays short', () => {
    const result = read('?rule=B3/S23&seed=1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = writeView(new URL(`${base}?junk=1`), result.view);
    expect(url.search).toBe('?rule=B3%2FS23&seed=1');
  });
});
