import {
  clampCamera,
  classLegend,
  createAtlasRenderer,
  cssColour,
  disagreementLegend,
  hatchCss,
  loadManifest,
  panBy,
  rampLegend,
  ruleAt,
  screenToChart,
  zoomAt,
  type AtlasManifest,
  type Camera,
  type LegendItem,
} from './atlas';
import { createEngine, parseRule, type Engine } from './engine';
import { readView, writeView, type View } from './state';
import { withPngText } from './atlas/lib/png';
import { drawOverlay, loadNoise, paintOverlay, type NoiseProduct } from './atlas/lib/overlay';
import { epsFromStep, formatEpsilon, overlayLegend, overlayNote } from './atlas/lib/noise';

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
const noiseToggle = required<HTMLInputElement>('#noise-overlay');
const epsInput = required<HTMLInputElement>('#eps');
const epsValue = required<HTMLOutputElement>('#eps-value');
const noiseNote = required<HTMLElement>('#noise-note');

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
  const base = `${import.meta.env.BASE_URL}products/atlas/`;
  let manifest: AtlasManifest;
  try {
    manifest = await loadManifest(base);
  } catch (error) {
    showError(
      `Cannot load the atlas data: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const chart = { width: manifest.space.tile[0], height: manifest.space.tile[1] };
  for (const layer of manifest.layers) {
    const option = document.createElement('option');
    option.value = layer.metric;
    option.textContent = layer.metric.replaceAll('_', ' ');
    layerSelect.append(option);
  }
  const known = new Set(['class', ...manifest.layers.map((layer) => layer.metric)]);
  layerSelect.value = known.has(view.metric) ? view.metric : 'class';
  disagreementInput.checked = view.disagreement;

  let camera: Camera = clampCamera(view.camera, chart.width, chart.height);
  // The renderer keeps this object by reference: mutating it is what makes a layer switch repaint.
  const atlasView = {
    layer: layerSelect.value,
    disagreement: disagreementInput.checked,
  };
  const renderer = createAtlasRenderer(mapCanvas, {
    base,
    chart,
    pyramid: manifest.tiles,
    view: atlasView,
    onPaint: () => draw(),
  });

  // The overlay is a second layer over the same chart: measured offline per rule sample,
  // interpolated in epsilon between the stored levels, drawn with the map's own camera.
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = chart.width;
  overlayCanvas.height = chart.height;
  let noiseProduct: NoiseProduct | null = null;
  let noiseOn = false;
  let epsilon = 0;

  function paint(): void {
    if (!noiseProduct) return;
    paintOverlay(overlayCanvas, noiseProduct, epsilon, {
      light: manifest.palette.hatch.light,
      dark: manifest.palette.hatch.dark,
    });
    noiseNote.textContent = overlayNote(noiseProduct.manifest);
  }

  async function loadOverlay(): Promise<void> {
    try {
      noiseProduct = await loadNoise(`${import.meta.env.BASE_URL}products/noise/`);
      const data = noiseProduct.manifest;
      const first = data.anchors[0];
      const last = data.anchors[data.anchors.length - 1];
      epsilon = first?.eps ?? 0;
      epsInput.max = String(Math.round((last?.eps ?? 0) * data.slider_unit));
      epsInput.value = String(Math.round(epsilon * data.slider_unit));
      epsValue.textContent = formatEpsilon(epsilon);
      paint();
    } catch (error) {
      noiseToggle.disabled = true;
      noiseNote.textContent = `Noise overlay unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function applyEpsilon(): void {
    if (!noiseProduct) return;
    epsilon = epsFromStep(Number(epsInput.value), noiseProduct.manifest.slider_unit);
    epsValue.textContent = formatEpsilon(epsilon);
    paint();
    draw();
  }

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
      items = disagreementLegend(manifest.palette);
    } else if (metric === 'class') {
      items = classLegend(manifest.palette, manifest.classes.names);
    } else {
      const layer = manifest.layers.find((entry) => entry.metric === metric);
      items = rampLegend(manifest.palette, layer?.min ?? 0, layer?.max ?? 1);
    }
    if (noiseOn && noiseProduct) items = [...items, ...overlayLegend(noiseProduct.manifest)];
    legendBox.replaceChildren(
      ...items.map((item) => {
        const row = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = item.hatched ? 'swatch hatched' : 'swatch';
        if (item.hatched) swatch.style.background = hatchCss(manifest.palette);
        else if (item.colour) swatch.style.background = cssColour(item.colour);
        const label = document.createElement('span');
        label.textContent = item.label;
        row.append(swatch, label);
        return row;
      }),
    );
  }

  function updateLabels(): void {
    labelsBox.replaceChildren(
      ...manifest.space.landmarks.map((landmark) => {
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
    if (noiseOn && noiseProduct) {
      drawOverlay(mapCanvas.getContext('2d'), overlayCanvas, camera, chart);
    }
    const span = (1 / camera.zoom).toFixed(1);
    const metric = disagreementInput.checked ? 'classifier disagreement' : layerSelect.value;
    const noiseLabel = noiseOn ? ` · ε ${formatEpsilon(epsilon)}` : '';
    const streaming = renderer.pending > 0 ? ` · streaming ${renderer.pending}` : '';
    status.textContent =
      `${chart.width}×${chart.height} rules · ${metric}${noiseLabel} · x ${camera.x.toFixed(0)} y ${camera.y.toFixed(0)} · ` +
      `zoom ${camera.zoom.toFixed(2)}× (${span} cells/px) · ${renderer.loaded} tiles${streaming} · ` +
      `${manifest.profile} data`;
    document.body.dataset.zoom = String(camera.zoom);
    document.body.dataset.layer = layerSelect.value;
    document.body.dataset.tiles = String(renderer.loaded);
    document.body.dataset.pending = String(renderer.pending);
    document.body.dataset.overlay = noiseOn ? 'on' : 'off';
    document.body.dataset.eps = String(epsilon);
    document.body.dataset.state = 'ready';
    updateLabels();
  }

  function syncUrl(): void {
    const next = currentUrl();
    if (next.href !== location.href) history.replaceState(null, '', next);
  }

  function move(next: Camera): void {
    camera = clampCamera(next, chart.width, chart.height);
    draw();
    syncUrl();
  }

  function zoom(factor: number): void {
    const px = mapCanvas.width / 2;
    const py = mapCanvas.height / 2;
    move(zoomAt(camera, factor, px, py, chart.width, chart.height));
  }

  required<HTMLButtonElement>('#zoom-in').addEventListener('click', () => zoom(1.5));
  required<HTMLButtonElement>('#zoom-out').addEventListener('click', () => zoom(1 / 1.5));
  required<HTMLButtonElement>('#zoom-reset').addEventListener('click', () =>
    move({ x: 0, y: 0, zoom: 1 }),
  );

  layerSelect.addEventListener('change', () => {
    atlasView.layer = layerSelect.value;
    updateLegend();
    draw();
    syncUrl();
  });
  disagreementInput.addEventListener('change', () => {
    atlasView.disagreement = disagreementInput.checked;
    updateLegend();
    draw();
    syncUrl();
  });
  noiseToggle.addEventListener('change', () => {
    noiseOn = noiseToggle.checked;
    updateLegend();
    draw();
  });
  epsInput.addEventListener('input', () => applyEpsilon());

  mapCanvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = mapCanvas.getBoundingClientRect();
      const scale = mapCanvas.width / rect.width;
      const px = (event.clientX - rect.left) * scale;
      const py = (event.clientY - rect.top) * scale;
      move(zoomAt(camera, event.deltaY < 0 ? 1.2 : 1 / 1.2, px, py, chart.width, chart.height));
    },
    { passive: false },
  );

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
    move(panBy(camera, dx, dy, chart.width, chart.height));
  });
  mapCanvas.addEventListener('pointerup', () => {
    dragging = null;
  });

  mapCanvas.addEventListener('click', (event) => {
    const rect = mapCanvas.getBoundingClientRect();
    const scale = mapCanvas.width / rect.width;
    const point = screenToChart(
      camera,
      (event.clientX - rect.left) * scale,
      (event.clientY - rect.top) * scale,
    );
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= chart.width || y >= chart.height) return;
    void runRule(ruleAt(x, y), x, y);
  });

  mapCanvas.addEventListener('keydown', (event) => {
    const step = 40;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(panBy(camera, step, 0, chart.width, chart.height)),
      ArrowRight: () => move(panBy(camera, -step, 0, chart.width, chart.height)),
      ArrowUp: () => move(panBy(camera, 0, step, chart.width, chart.height)),
      ArrowDown: () => move(panBy(camera, 0, -step, chart.width, chart.height)),
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
    setRuleStatus('exported a PNG with its reproduce link', ruleStatus.dataset.rule ?? '');
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
  await loadOverlay();
  draw();
  updateLegend();
  syncUrl();
  setRuleStatus('click the map to run a rule', view.canonical);
  window.addEventListener('resize', () => {
    sizeCanvas();
    draw();
  });
}
