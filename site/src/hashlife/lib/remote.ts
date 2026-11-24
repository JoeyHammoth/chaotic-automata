// The page's handle on the HashLife worker.
//
// The module builds the 2x2 metapixel array's tree in about six seconds, and six seconds of a
// frozen page reads as a broken page. So the tree lives in a worker and every question here is a
// promise: numbers when the readout is asked for, and the 640x640 density window when a paint
// needs it. Nothing else crosses the boundary — the tree never leaves the worker's memory.

import type { Pattern } from './rle';

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
}

/**
 * Start the worker and load a pattern or a macrocell into it. Resolves with the tree's numbers as
 * well as the handle, because the page needs them to fit the view and does not want a second round
 * trip for what the load already computed.
 */
export async function createRemoteHashLife(
  source: { pattern: Pattern } | { text: string },
): Promise<LoadedRemote> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    throw new Error(
      `this browser could not start the HashLife worker: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const pending = new Map<
    number,
    { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
  >();
  let next = 1;

  const failAll = (message: string): void => {
    for (const waiter of pending.values()) waiter.reject(new Error(message));
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
  worker.addEventListener('error', () => failAll('the HashLife worker crashed'));

  const ask = (body: RequestBody): Promise<WorkerReply> =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...body, id });
    });

  const life: RemoteHashLife = {
    async readout() {
      const reply = await ask({ kind: 'readout' });
      if (reply.readout === undefined) throw new Error('the worker returned no readout');
      return reply.readout;
    },
    async step(generations: number) {
      const reply = await ask({ kind: 'step', generations });
      return reply.stepped === true;
    },
    async view(level: number, x: number, y: number, cells: number) {
      const reply = await ask({ kind: 'view', level, x, y, cells });
      return reply.pixels ?? new Uint8Array(0);
    },
    close() {
      failAll('the HashLife worker was closed');
      worker.terminate();
    },
  };

  let reply: WorkerReply;
  try {
    reply =
      'text' in source
        ? await ask({ kind: 'load-macrocell', text: source.text })
        : await ask({ kind: 'load-pattern', pattern: source.pattern });
  } catch (error) {
    worker.terminate();
    throw error;
  }
  if (reply.readout === undefined) {
    worker.terminate();
    throw new Error('the worker loaded a tree but reported no readout');
  }
  return { life, readout: reply.readout };
}
