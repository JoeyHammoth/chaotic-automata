import { createEngine, type Engine } from './engine';
import { createGridRenderer } from './render';
import { readView, writeView, type View } from './state';

const STEP_INTERVAL_MS = 100;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page shell is missing ${selector}`);
  return element;
}

const canvas = required<HTMLCanvasElement>('#grid');
const status = required<HTMLElement>('#status');
const errorBox = required<HTMLElement>('#error');
const description = required<HTMLElement>('#description');

const result = readView(new URL(location.href));

if (!result.ok) {
  showError(result.message);
} else {
  void start(result.view);
}

function showError(message: string): void {
  errorBox.hidden = false;
  errorBox.textContent = message;
  canvas.hidden = true;
  status.textContent = 'not running';
  document.body.dataset.state = 'error';
}

async function start(view: View): Promise<void> {
  // The canonical rule replaces whatever the visitor typed, so the URL always names one rule.
  const canonicalUrl = writeView(new URL(location.href), view);
  if (canonicalUrl.href !== location.href) history.replaceState(null, '', canonicalUrl);

  const engine: Engine = await createEngine({
    rule: view.rule,
    width: view.size,
    height: view.size,
    seed: view.seed,
  });

  const renderer = createGridRenderer(canvas, engine.width, engine.height);
  const target = view.steps;
  let generation = 0;
  let lastStep = performance.now();
  let frames = 0;

  function draw(): void {
    renderer.draw(engine.cells());
    frames += 1;
    document.body.dataset.frames = String(frames);
    document.body.dataset.tier = engine.tier;
    document.body.dataset.generation = String(generation);
    document.body.dataset.state = target !== null && generation >= target ? 'paused' : 'running';
    const where = target !== null && generation >= target ? `paused at generation ${generation}` : `generation ${generation}`;
    status.textContent = `${view.canonical} · seed ${view.seed} · ${engine.width}×${engine.height} · ${engine.tier} · ${where}`;
    if (generation % 20 === 0) {
      description.textContent = `${view.canonical} on a ${engine.width}×${engine.height} torus from seed ${view.seed}, generation ${generation}, rendered by the ${engine.tier} engine.`;
    }
  }

  function frame(now: number): void {
    const finished = target !== null && generation >= target;
    if (!finished && now - lastStep >= STEP_INTERVAL_MS) {
      engine.step(1);
      generation += 1;
      lastStep = now;
      draw();
    }
    requestAnimationFrame(frame);
  }

  draw();
  requestAnimationFrame(frame);
}
