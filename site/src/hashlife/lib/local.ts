// The engine on the page's own thread, for a browser that cannot start a module worker.
//
// The worker is the right default: reading the metapixel array takes seconds, and a page frozen that
// long reads as a broken page. A browser that cannot do it off-thread can still do it at
// all, so this path runs the module in place and accepts the freeze. It is reached through a dynamic
// import in `remote.ts`, so nothing here costs a browser that has the worker.

import { readoutOf, type LoadedRemote, type RemoteHashLife } from './remote';
import type { Pattern } from './rle';
import { createHashLife, createHashLifeFromMacrocell, type HashLife } from './wasm';

export async function createLocalHashLife(
  source: { pattern: Pattern } | { text: string },
): Promise<LoadedRemote> {
  const life: HashLife =
    'text' in source
      ? await createHashLifeFromMacrocell(source.text)
      : await createHashLife(source.pattern);

  const handle: RemoteHashLife = {
    // Every answer is a promise even though nothing is in flight: the page cannot tell the two
    // paths apart, which is what keeps one render path instead of two.
    async readout() {
      return readoutOf(life);
    },
    async step(generations: number) {
      return life.step(generations);
    },
    async view(level: number, x: number, y: number, cells: number) {
      return life.view(level, x, y, cells);
    },
    close() {
      // The module's memory lives as long as the page and the next load replaces the tree in it, so
      // this path has nothing to hand back.
    },
  };

  return { life: handle, readout: readoutOf(life), offThread: false };
}
