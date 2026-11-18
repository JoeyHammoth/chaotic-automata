import {
  clampCamera,
  classLegend,
  createAtlasRenderer,
  cssColour,
  loadAtlas,
  panBy,
  rampLegend,
  ruleAt,
  screenToChart,
  zoomAt,
  type AtlasData,
  type Camera,
  type LegendItem,
} from './atlas';
import { createEngine, parseRule, type Engine } from './engine';
import { readView, writeView, type View } from './state';
import { withPngText } from './atlas/lib/png';

const STEP_INTERVAL_MS = 100;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page shell is missing ${selector}`);
  return element;
}

const mapCanvas = required<HTMLCanvasElement>('#atlas');
const status = required<HTMLElement>('#status');
const errorBox = required<HTMLElement>('#error');
const layerSelect = required<HTMLSelectElement>('#layer');
const disagreementInput = required<HTMLInputElement>('#disagreement');
const legendBox = required<HTMLElement>('#legend');
const labelsBox = required<HTMLElement>('#labels');
const ruleCanvas = required<HTMLCanvasElement>('#rule-canvas');
const ruleStatus = required<HTMLElement>('#rule-status');
const ruleHeading = required<HTMLElement>('#rule-heading');

const result = readView(new URL(location.href));
if (!result.ok) {
  showError(result.message);
} else {
  void start(result.view);
}

function showError(message: string): void {
  errorBox.hidden = false;
  errorBox.textContent = message;
  mapCanvas.hidden = true;
  status.textContent = 'atlas unavailable';
  document.body.dataset.state = 'error';
}

async function start(view: View): Promise<void> {
  let data: AtlasData;
  try {
    data = await loadAtlas(`${import.meta.env.BASE_URL}products/atlas/`);
  } catch (error) {
    showError(`Cannot load the atlas data: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  for (const layer of data.manifest.layers) {
    const option = document.createElement('option');
    option.value = layer.metric;
    option.textContent = layer.metric.replaceAll('_', ' ');
    layerSelect.append(option);
  }
  layerSelect.value = view.metric === 'class' || data.layers.has(view.metric) ? view.metric : 'class';
  disagreementInput.checked = view.disagreement;
  layerSelect.value = view.metric === 'class' || data.layers.has(view.metric) ? view.metric : 'class';

  let camera: Camera = clampCamera(view.camera, data.width, data.height);
  // The renderer keeps this object by reference: mutating it is what makes a layer switch repaint.
  const atlasView = {
    layer: layerSelect.value,
    disagreement: disagreementInput.checked,
  };
  const renderer = createAtlasRenderer(mapCanvas, data, atlasView);

  function sizeCanvas(): void {
    const rect = mapCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mapCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    mapCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function currentUrl(): URL {
    return writeView(new URL(location.href), {
      ...view,
      metric: layerSelect.value,
      disagreement: disagreementInput.checked,
      camera,
    });
  }

  function updateLegend(): void {
    const metric = layerSelect.value;
    let items: LegendItem[];
    if (disagreementInput.checked) {
      items = [
        { label: 'classifiers disagree', colour: [240, 44, 38] },
        { label: 'classifiers agree', colour: [60, 64, 78] },
      ];
    } else if (metric === 'class') {
      items = classLegend();
    } else {
      const layer = data.manifest.layers.find((entry) => entry.metric === metric);
      items = rampLegend(layer?.min ?? 0, layer?.max ?? 1);
    }
    legendBox.replaceChildren(
      ...items.map((item) => {
        const row = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = item.hatched ? 'swatch hatched' : 'swatch';
        if (item.colour) swatch.style.background = cssColour(item.colour);
        const label = document.createElement('span');
        label.textContent = item.label;
        row.append(swatch, label);
        return row;
      }),
    );
  }

  function updateLabels(): void {
    labelsBox.replaceChildren(
      ...data.manifest.space.landmarks.map((landmark) => {
        const item = document.createElement('li');
        item.textContent = `${landmark.name} · ${landmark.rule}`;
        const sx = (landmark.birth_index - camera.x) * camera.zoom;
        const sy = (landmark.survival_index - camera.y) * camera.zoom;
        item.style.transform = `translate(${sx}px, ${sy}px)`;
        item.hidden = sx < -40 || sy < -20 || sx > mapCanvas.clientWidth || sy > mapCanvas.clientHeight;
        return item;
      }),
    );
  }

  function draw(): void {
    renderer.draw(camera);
    const span = (1 / camera.zoom).toFixed(1);
    const metric = disagreementInput.checked ? 'classifier disagreement' : layerSelect.value;
    status.textContent =
      `${data.width}×${data.height} rules · ${metric} · x ${camera.x.toFixed(0)} y ${camera.y.toFixed(0)} · ` +
      `zoom ${camera.zoom.toFixed(2)}× (${span} cells/px) · ${data.manifest.profile} data`;
    document.body.dataset.zoom = String(camera.zoom);
    document.body.dataset.layer = layerSelect.value;
    document.body.dataset.state = 'ready';
    updateLabels();
  }

  function syncUrl(): void {
    const next = currentUrl();
    if (next.href !== location.href) history.replaceState(null, '', next);
  }

  function move(next: Camera): void {
    camera = clampCamera(next, data.width, data.height);
    draw();
    syncUrl();
  }

  function zoom(factor: number): void {
    const px = mapCanvas.width / 2;
    const py = mapCanvas.height / 2;
    move(zoomAt(camera, factor, px, py, data.width, data.height));
  }

  required<HTMLButtonElement>('#zoom-in').addEventListener('click', () => zoom(1.5));
  required<HTMLButtonElement>('#zoom-out').addEventListener('click', () => zoom(1 / 1.5));
  required<HTMLButtonElement>('#zoom-reset').addEventListener('click', () =>
    move({ x: 0, y: 0, zoom: 1 }),
  );

  layerSelect.addEventListener('change', () => {
    atlasView.layer = layerSelect.value;
    renderer.repaint();
    updateLegend();
    draw();
    syncUrl();
  });
  disagreementInput.addEventListener('change', () => {
    atlasView.disagreement = disagreementInput.checked;
    renderer.repaint();
    updateLegend();
    draw();
    syncUrl();
  });

  mapCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = mapCanvas.getBoundingClientRect();
    const scale = mapCanvas.width / rect.width;
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * scale;
    move(zoomAt(camera, event.deltaY < 0 ? 1.2 : 1 / 1.2, px, py, data.width, data.height));
  }, { passive: false });

  let dragging: { x: number; y: number } | null = null;
  mapCanvas.addEventListener('pointerdown', (event) => {
    dragging = { x: event.clientX, y: event.clientY };
    mapCanvas.setPointerCapture(event.pointerId);
  });
  mapCanvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const scale = mapCanvas.width / mapCanvas.getBoundingClientRect().width;
    const dx = (event.clientX - dragging.x) * scale;
    const dy = (event.clientY - dragging.y) * scale;
    dragging = { x: event.clientX, y: event.clientY };
    move(panBy(camera, dx, dy, data.width, data.height));
  });
  mapCanvas.addEventListener('pointerup', () => {
    dragging = null;
  });

  mapCanvas.addEventListener('click', (event) => {
    const rect = mapCanvas.getBoundingClientRect();
    const scale = mapCanvas.width / rect.width;
    const point = screenToChart(camera, (event.clientX - rect.left) * scale, (event.clientY - rect.top) * scale);
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
    void runRule(ruleAt(x, y), x, y);
  });

  mapCanvas.addEventListener('keydown', (event) => {
    const step = 40;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(panBy(camera, step, 0, data.width, data.height)),
      ArrowRight: () => move(panBy(camera, -step, 0, data.width, data.height)),
      ArrowUp: () => move(panBy(camera, 0, step, data.width, data.height)),
      ArrowDown: () => move(panBy(camera, 0, -step, data.width, data.height)),
      '+': () => zoom(1.5),
      '=': () => zoom(1.5),
      '-': () => zoom(1 / 1.5),
      '0': () => move({ x: 0, y: 0, zoom: 1 }),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  });

  required<HTMLButtonElement>('#export').addEventListener('click', () => {
    const url = currentUrl().href;
    void exportFigure(url);
  });
  required<HTMLButtonElement>('#copy-link').addEventListener('click', () => {
    void copyLink(currentUrl().href);
  });

  async function exportFigure(url: string): Promise<void> {
    const blob = await new Promise<Blob | null>((resolve) => mapCanvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      showError('The browser could not produce a PNG from the map.');
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const withText = withPngText(bytes, {
      Software: 'Computation Atlas',
      Comment: `Reproduce: ${url}`,
      Source: url,
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([withText as unknown as BlobPart], { type: 'image/png' }),
    );
    link.download = 'computation-atlas.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    setRuleStatus(`exported a PNG with its reproduce link`, ruleStatus.dataset.rule ?? '');
  }

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setRuleStatus('reproduce link copied to the clipboard', ruleStatus.dataset.rule ?? '');
    } catch {
      setRuleStatus(`reproduce link: ${url}`, ruleStatus.dataset.rule ?? '');
    }
  }

  let engine: Engine | null = null;
  let animation = 0;

  function setRuleStatus(text: string, rule: string): void {
    ruleStatus.dataset.rule = rule;
    ruleStatus.textContent = text;
  }

  async function runRule(ruleText: string, x: number, y: number): Promise<void> {
    let rule;
    try {
      rule = parseRule(ruleText);
    } catch (error) {
      showError(`Cannot run ${ruleText}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    cancelAnimationFrame(animation);
    engine = await createEngine({ rule, width: view.size, height: view.size, seed: view.seed });
    const context = ruleCanvas.getContext('2d');
    if (!context) return;
    ruleCanvas.width = engine.width;
    ruleCanvas.height = engine.height;
    const image = context.createImageData(engine.width, engine.height);
    let generation = 0;
    let frames = 0;

    const drawRule = (): void => {
      const cells = engine?.cells() ?? new Uint8Array(0);
      const data = image.data;
      for (let i = 0; i < cells.length; i += 1) {
        const alive = cells[i] === 1;
        const offset = i * 4;
        data[offset] = alive ? 123 : 8;
        data[offset + 1] = alive ? 209 : 11;
        data[offset + 2] = alive ? 192 : 15;
        data[offset + 3] = 255;
      }
      context?.putImageData(image, 0, 0);
      frames += 1;
      document.body.dataset.ruleFrames = String(frames);
      ruleHeading.textContent = `${ruleText} · chart (${x}, ${y})`;
      setRuleStatus(
        `seed ${view.seed} · ${engine?.width ?? 0}×${engine?.height ?? 0} · ${engine?.tier ?? 'cpu'} · generation ${generation}`,
        ruleText,
      );
    };

    let last = performance.now();
    const frame = (now: number): void => {
      const paused = view.steps !== null && generation >= view.steps;
      if (!paused && now - last >= STEP_INTERVAL_MS) {
        engine?.step(1);
        generation += 1;
        last = now;
        drawRule();
      }
      animation = requestAnimationFrame(frame);
    };

    drawRule();
    animation = requestAnimationFrame(frame);
  }

  sizeCanvas();
  draw();
  updateLegend();
  syncUrl();
  setRuleStatus('click the map to run a rule', view.canonical);
  window.addEventListener('resize', () => {
    sizeCanvas();
    draw();
  });
}
