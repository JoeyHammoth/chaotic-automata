// The HashLife module, off the page's thread.
//
// The tree lives in the module's memory and stays here: the page asks for the numbers and for the
// pixels it is about to draw, and nothing else crosses the boundary. That is what keeps a long
// load from freezing the page — the load blocks this thread, which has nothing else to do.

import { readoutOf, type WorkerReply, type WorkerRequest } from './remote';
import type { Pattern } from './rle';
import { createHashLife, createHashLifeFromMacrocell, type HashLife } from './wasm';

interface Scope {
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const scope = self as unknown as Scope;

let hash: HashLife | null = null;

function reply(message: WorkerReply, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer);
}

async function handle(request: WorkerRequest): Promise<void> {
  try {
    if (request.kind === 'load-pattern') {
      hash = await createHashLife(request.pattern as Pattern);
      reply({ id: request.id, ok: true, readout: readoutOf(hash) });
      return;
    }
    if (request.kind === 'load-macrocell') {
      hash = await createHashLifeFromMacrocell(request.text);
      reply({ id: request.id, ok: true, readout: readoutOf(hash) });
      return;
    }
    const life = hash;
    if (life === null) throw new Error('no tree has been loaded yet');
    if (request.kind === 'readout') {
      reply({ id: request.id, ok: true, readout: readoutOf(life) });
      return;
    }
    if (request.kind === 'step') {
      reply({ id: request.id, ok: true, stepped: life.step(request.generations) });
      return;
    }
    const pixels = life.view(request.level, request.x, request.y, request.cells);
    // The window is a copy of its own, so handing its buffer over costs nothing and copies nothing.
    reply({ id: request.id, ok: true, pixels }, [pixels.buffer]);
  } catch (error) {
    reply({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
};
