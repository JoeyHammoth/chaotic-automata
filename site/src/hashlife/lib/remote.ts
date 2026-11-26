// The page's handle on the HashLife worker.
//
// The module builds the 2x2 metapixel array's tree in seconds, and that long with a frozen page
// reads as a broken page. So the tree lives in a worker and every question here is a promise:
// numbers when the readout is asked for, and the 640x640 density window when a paint needs it.
// Nothing else crosses the boundary — the tree never leaves the worker's memory.
//
// One worker serves the whole page rather than one per load. A worker's start is most of a second
// and it compiles the module again from scratch, so paying that for every pattern the page shows
// was the largest part of a second load; the tree is replaced in place instead, and the engine's
// memory is reused rather than grown.

import type { Pattern } from './rle';
import type { HashLife } from './wasm';

export interface Readout {
  generation: number;
  population: number;
  nodes: number;
  cap: number;
  capHits: number;
  level: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface RemoteHashLife {
  readout(): Promise<Readout>;
  /** False when the node cap or the level limit refused the step. */
  step(generations: number): Promise<boolean>;
  /** A `cells x cells` window of node populations at `level`, copied out of the module. */
  view(level: number, x: number, y: number, cells: number): Promise<Uint8Array>;
  /** Nothing to release: the worker is the page's, and the next load replaces the tree in it. */
  close(): void;
}

export type WorkerRequest =
  | { id: number; kind: 'load-pattern'; pattern: Pattern }
  | { id: number; kind: 'load-macrocell'; text: string }
  | { id: number; kind: 'readout' }
  | { id: number; kind: 'step'; generations: number }
  | { id: number; kind: 'view'; level: number; x: number; y: number; cells: number };

/** A request without its correlation id, which the facade assigns. */
export type RequestBody = WorkerRequest extends infer T
  ? T extends { id: number }
    ? Omit<T, 'id'>
    : never
  : never;

export interface WorkerReply {
  id: number;
  ok: boolean;
  error?: string;
  readout?: Readout;
  stepped?: boolean;
  pixels?: Uint8Array;
}

export interface LoadedRemote {
  life: RemoteHashLife;
  readout: Readout;
  /** True when the engine is off the page's thread; false when the load blocks the page. */
  offThread: boolean;
}

/** The engine's own numbers for a tree, in the shape the page reads. */
export function readoutOf(life: HashLife): Readout {
  return {
    generation: life.generation(),
    population: life.population(),
    nodes: life.nodes(),
    cap: life.cap(),
    capHits: life.capHits(),
    level: life.level(),
    bounds: life.bounds(),
  };
}

/**
 * The worker could not be started or could not load its module. That is a reason to try the other
 * path, not a reason to fail: an old browser can still run the engine, just not off this thread.
 */
class WorkerUnavailable extends Error {}

/** The page's one worker, or the reason there is none. */
interface Channel {
  ask(body: RequestBody): Promise<WorkerReply>;
}

let channel: Promise<Channel> | null = null;

/**
 * The worker, started on first use and kept afterwards. A start that fails is not cached, so a
 * browser that cannot do module workers retries cheaply and falls back again rather than being
 * written off for good by one failure.
 */
function openChannel(): Promise<Channel> {
  channel ??= startChannel().catch((error: unknown) => {
    channel = null;
    throw error;
  });
  return channel;
}

function startChannel(): Promise<Channel> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch (error) {
      reject(
        new WorkerUnavailable(
          `this browser could not start the HashLife worker: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
      return;
    }

    const pending = new Map<
      number,
      { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
    >();
    let next = 1;

    const failAll = (error: Error): void => {
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    };

    worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const waiter = pending.get(reply.id);
      if (waiter === undefined) return;
      pending.delete(reply.id);
      if (reply.ok) waiter.resolve(reply);
      else waiter.reject(new Error(reply.error ?? 'the HashLife worker refused that'));
    });
    // A browser that cannot load a module worker fails right here, before any reply: the script
    // never runs, so the error event is the one signal that the other path is needed. A worker that
    // dies later takes its tree with it, and the next load starts another.
    worker.addEventListener('error', () => {
      channel = null;
      failAll(new WorkerUnavailable('the HashLife worker crashed'));
    });

    resolve({
      ask: (body: RequestBody) =>
        new Promise<WorkerReply>((done, fail) => {
          const id = next++;
          pending.set(id, { resolve: done, reject: fail });
          worker.postMessage({ ...body, id });
        }),
    });
  });
}

/**
 * Load a pattern or a macrocell, off the page's thread when the browser can start a module worker
 * and on it when it cannot. Resolves with the tree's numbers as well as the handle, because the page
 * needs them to fit the view and does not want a second round trip for what the load already
 * computed.
 */
export async function createRemoteHashLife(
  source: { pattern: Pattern } | { text: string },
): Promise<LoadedRemote> {
  try {
    return await loadInWorker(source);
  } catch (error) {
    if (!(error instanceof WorkerUnavailable)) throw error;
    // Imported only here, so a browser with a worker never downloads this chunk: the page's own
    // thread is the fallback, and the freeze it brings is the price of having no worker.
    const { createLocalHashLife } = await import('./local');
    return createLocalHashLife(source);
  }
}

/** The preferred path: the whole tree in the page's worker, and every question about it a message. */
async function loadInWorker(source: { pattern: Pattern } | { text: string }): Promise<LoadedRemote> {
  const { ask } = await openChannel();
  const reply =
    'text' in source
      ? await ask({ kind: 'load-macrocell', text: source.text })
      : await ask({ kind: 'load-pattern', pattern: source.pattern });
  if (reply.readout === undefined) {
    throw new Error('the worker loaded a tree but reported no readout');
  }

  const life: RemoteHashLife = {
    async readout() {
      const answer = await ask({ kind: 'readout' });
      if (answer.readout === undefined) throw new Error('the worker returned no readout');
      return answer.readout;
    },
    async step(generations: number) {
      const answer = await ask({ kind: 'step', generations });
      return answer.stepped === true;
    },
    async view(level: number, x: number, y: number, cells: number) {
      const answer = await ask({ kind: 'view', level, x, y, cells });
      return answer.pixels ?? new Uint8Array(0);
    },
    close() {
      // The worker outlives this handle: the load that replaced this tree is the one that made the
      // handle stale, and it has already put its own tree where this one was.
    },
  };

  return { life, readout: reply.readout, offThread: true };
}
