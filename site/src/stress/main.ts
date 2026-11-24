import { decadeTicks, logScale, type Frame } from './lib/chart';
import {
  cellAt,
  describeCell,
  formatLifetime,
  formatNoise,
  nearestNoise,
  readNoiseParam,
  seriesFor,
  type Claim,
  type DkSection,
  type PanelDocument,
  type ToomSection,
} from './lib/panel';
import {
  curveFor,
  describeCurve,
  formatRate,
  nodesPerLevel,
  type TowerCurve,
  type TowerSection,
} from './lib/tower';

// Every figure here is a recorded run. The page paints what the product says, including the runs
// that hit their cap: those are drawn on the cap line as lower bounds and are never joined to a
// curve, because a bound is not a value.

const BACKGROUND = '#05070a';
const GRID = '#1b2129';
const TEXT = '#9aa4b2';
const NEC = '#7bd1c0';
const SYMMETRIC = '#ff8f7a';
const MARK = '#ffffff';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page shell is missing ${selector}`);
  return element;
}

const noiseInput = required<HTMLInputElement>('#noise');
const noiseValue = required<HTMLOutputElement>('#noise-value');
const noiseNote = required<HTMLElement>('#noise-note');
const toomCanvas = required<HTMLCanvasElement>('#toom-chart');
const toomTable = required<HTMLTableSectionElement>('#toom-table');
const toomClaim = required<HTMLElement>('#toom-claim');
const toomCaption = required<HTMLElement>('#toom-caption');
const dkCanvas = required<HTMLCanvasElement>('#dk-chart');
const dkReadout = required<HTMLElement>('#dk-readout');
const dkTable = required<HTMLTableSectionElement>('#dk-table');
const dkSummary = required<HTMLElement>('#dk-summary');
const dkVerdict = required<HTMLElement>('#dk-verdict');
const status = required<HTMLElement>('#status');
const errorBox = required<HTMLElement>('#error');
const towerInput = required<HTMLInputElement>('#tower-rate');
const towerValue = required<HTMLOutputElement>('#tower-rate-value');
const towerCanvas = required<HTMLCanvasElement>('#tower-chart');
const towerTable = required<HTMLTableSectionElement>('#tower-table');
const towerSummary = required<HTMLElement>('#tower-summary');
const towerCaption = required<HTMLElement>('#tower-caption');
const towerClaim = required<HTMLElement>('#tower-claim');
const towerNote = required<HTMLElement>('#tower-note');

let loaded: PanelDocument | null = null;
let noise = 0;

function showError(message: string): void {
  errorBox.hidden = false;
  errorBox.textContent = message;
  status.textContent = 'panel unavailable';
  document.body.dataset.state = 'error';
}

function toomFrame(canvas: HTMLCanvasElement): Frame {
  return { left: 70, top: 26, width: canvas.width - 96, height: canvas.height - 84 };
}

function dkFrame(canvas: HTMLCanvasElement): Frame {
  return { left: 54, top: 22, width: canvas.width - 78, height: canvas.height - 78 };
}

function drawToom(section: ToomSection, current: number): void {
  const context = toomCanvas.getContext('2d');
  if (!context) return;
  const { width, height } = toomCanvas;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  const frame = toomFrame(toomCanvas);
  const cap = section.cap;
  const y = logScale(1, cap * 2, frame.top + frame.height, frame.top);
  const lattices = section.lattices;
  const step = lattices.length > 1 ? frame.width / (lattices.length - 1) : 0;
  const x = (index: number) => frame.left + step * index;

  context.font = '11px system-ui, sans-serif';
  context.lineWidth = 1;
  context.strokeStyle = GRID;
  context.fillStyle = TEXT;
  for (const tick of decadeTicks(1, cap * 2)) {
    const py = y(tick);
    context.beginPath();
    context.moveTo(frame.left, py);
    context.lineTo(frame.left + frame.width, py);
    context.stroke();
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(tick.toLocaleString('en-US'), frame.left - 8, py);
  }

  const capY = y(cap);
  context.setLineDash([4, 4]);
  context.strokeStyle = '#3b4756';
  context.beginPath();
  context.moveTo(frame.left, capY);
  context.lineTo(frame.left + frame.width, capY);
  context.stroke();
  context.setLineDash([]);
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  context.fillStyle = TEXT;
  context.fillText(
    `cap ${cap.toLocaleString('en-US')} — a mark on this line means at least the cap`,
    frame.left + 6,
    capY - 5,
  );

  context.strokeStyle = '#2a323d';
  context.beginPath();
  context.moveTo(frame.left, frame.top);
  context.lineTo(frame.left, frame.top + frame.height);
  context.lineTo(frame.left + frame.width, frame.top + frame.height);
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'top';
  lattices.forEach((lattice, index) => {
    context.fillStyle = TEXT;
    context.fillText(`${lattice}×${lattice}`, x(index), frame.top + frame.height + 10);
  });
  context.fillStyle = TEXT;
  context.fillText('lattice', frame.left + frame.width / 2, frame.top + frame.height + 30);

  context.save();
  context.translate(18, frame.top + frame.height / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('steps until the bit is lost (log)', 0, 0);
  context.restore();

  const drawSeries = (rule: 'nec' | 'symmetric', colour: string): void => {
    const points = seriesFor(section, rule, current);
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = 2;
    let previous: { x: number; y: number } | null = null;
    points.forEach((point, index) => {
      const px = x(index);
      if (point.lower_bound) {
        previous = null;
        context.beginPath();
        context.moveTo(px, capY - 6);
        context.lineTo(px + 5, capY + 3);
        context.lineTo(px - 5, capY + 3);
        context.closePath();
        context.stroke();
        return;
      }
      const py = y(point.median);
      if (previous) {
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(px, py);
        context.stroke();
      }
      context.beginPath();
      context.arc(px, py, 3.5, 0, Math.PI * 2);
      context.fill();
      previous = { x: px, y: py };
    });
  };
  drawSeries('nec', NEC);
  drawSeries('symmetric', SYMMETRIC);

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  let legendX = frame.left + 4;
  for (const [label, colour] of [
    ['NEC (Toom)', NEC],
    ['4-neighbour majority', SYMMETRIC],
  ] as const) {
    context.fillStyle = colour;
    context.fillRect(legendX, frame.top - 16, 10, 10);
    context.fillStyle = TEXT;
    context.fillText(label, legendX + 16, frame.top - 11);
    legendX += 16 + context.measureText(label).width + 26;
  }
}

function renderToomTable(section: ToomSection, current: number): void {
  toomTable.replaceChildren();
  for (const lattice of section.lattices) {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = `${lattice}×${lattice}`;
    row.append(head);
    for (const rule of ['nec', 'symmetric'] as const) {
      const point = section[rule].find(
        (entry) => entry.lattice === lattice && Math.abs(entry.noise - current) < 1e-12,
      );
      const cell = document.createElement('td');
      cell.className = 'num';
      cell.textContent = point ? formatLifetime(point, section.cap) : '—';
      row.append(cell);
    }
    toomTable.append(row);
  }
}

function renderClaim(target: HTMLElement, claim: Claim): void {
  target.replaceChildren();
  const text = document.createElement('p');
  text.textContent = claim.text;
  const source = document.createElement('p');
  source.className = 'status';
  source.textContent = claim.source;
  const badge = document.createElement('span');
  badge.className = claim.verified ? 'badge verified' : 'badge unverified';
  badge.textContent = claim.verified
    ? 'verified by this code'
    : 'literature claim — not re-proved here';
  target.append(text, source, badge);
}

function drawDk(section: DkSection): void {
  const context = dkCanvas.getContext('2d');
  if (!context) return;
  const { width, height } = dkCanvas;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  const frame = dkFrame(dkCanvas);
  const grid = section.grid;
  const cell = frame.width / (grid + 1);
  const centre = (p1: number, p2: number): { x: number; y: number } => ({
    x: frame.left + (p1 * grid + 0.5) * cell,
    y: frame.top + ((1 - p2) * grid + 0.5) * cell,
  });

  for (const entry of section.cells) {
    const point = centre(entry.p1, entry.p2);
    const level = entry.active;
    context.fillStyle = `rgb(${Math.round(13 + level * 110)}, ${Math.round(17 + level * 192)}, ${Math.round(23 + level * 169)})`;
    context.fillRect(point.x - cell / 2, point.y - cell / 2, cell + 0.5, cell + 0.5);
  }

  context.strokeStyle = '#2a323d';
  context.lineWidth = 1;
  context.strokeRect(frame.left, frame.top, frame.width, frame.height);

  context.font = '11px system-ui, sans-serif';
  context.fillStyle = TEXT;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const px = frame.left + tick * frame.width;
    context.fillText(String(tick), px, frame.top + frame.height + 8);
  }
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const py = frame.top + (1 - tick) * frame.height;
    context.fillText(String(tick), frame.left - 8, py);
  }
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText('p1', frame.left + frame.width / 2, frame.top + frame.height + 26);
  context.save();
  context.translate(14, frame.top + frame.height / 2);
  context.rotate(-Math.PI / 2);
  context.fillText('p2', 0, 0);
  context.restore();

  // The two literature points, which the measured boundary has to pass through if it is right.
  for (const [label, point] of [
    ['bond DP', section.literature.bond],
    ['site DP', section.literature.site],
  ] as const) {
    const at = centre(point.p1, point.p2);
    context.strokeStyle = MARK;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(at.x, at.y, 6, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = MARK;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(label, at.x + 10, at.y - 10);
  }
}

function renderFits(section: DkSection): void {
  const decay = section.decay;
  dkTable.replaceChildren();
  for (const fit of decay.fits) {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = String(fit.lattice);
    const delta = document.createElement('td');
    delta.className = 'num';
    delta.textContent = fit.delta === null ? 'no fit' : fit.delta.toFixed(3);
    const interval = document.createElement('td');
    interval.className = 'num';
    const [low, high] = fit.interval;
    interval.textContent =
      low === null || low === undefined || high === null || high === undefined
        ? '—'
        : `${low.toFixed(3)} – ${high.toFixed(3)}`;
    const judgement = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${fit.verdict.state}`;
    badge.textContent = fit.verdict.state;
    judgement.append(badge);
    row.append(head, delta, interval, judgement);
    dkTable.append(row);
  }

  dkVerdict.replaceChildren();
  const quoted = document.createElement('p');
  quoted.textContent =
    `quoted δ = ${decay.delta_dp.toFixed(6)}(${Math.round(decay.delta_dp_se * 1e6)}) · ` +
    `tolerance ±${decay.tolerance} · window t = ${decay.window[0]}–${decay.window[1]} · ` +
    `${decay.seeds.length} seeds per lattice`;
  dkVerdict.append(quoted);
  for (const fit of decay.fits) {
    const line = document.createElement('p');
    line.className = 'status';
    line.textContent = `L = ${fit.lattice}: ${fit.verdict.text}`;
    dkVerdict.append(line);
  }
}

function applyNoise(value: number, updateUrl: boolean): void {
  if (!loaded) return;
  noise = value;
  const index = loaded.noise.grid.indexOf(value);
  noiseInput.value = String(index < 0 ? 0 : index);
  noiseValue.textContent = formatNoise(value);
  drawToom(loaded.toom, value);
  renderToomTable(loaded.toom, value);
  toomCaption.textContent =
    `Median steps until the bit is lost at ε = ${formatNoise(value)}, seeds ` +
    `${loaded.toom.seeds.join(', ')}. A ≥ mark means the run reached the cap of ` +
    `${loaded.toom.cap.toLocaleString('en-US')}.`;
  document.body.dataset.noise = String(value);
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('noise', String(value));
    history.replaceState(null, '', url);
  }
}

function drawTower(section: TowerSection, curve: TowerCurve): void {
  const context = towerCanvas.getContext('2d');
  if (!context) return;
  const { width, height } = towerCanvas;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);

  // Left: the tower itself, three levels of three-by-three nesting. A cell at the top level is a
  // block of three, each of those a block of three, each of those a block of three leaves.
  const depth = 3;
  const side = 240;
  const left = 8;
  const top = 46;
  const cells = section.block ** depth;
  const step = side / cells;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? '#10262a' : '#0a171a';
      context.fillRect(left + x * step, top + y * step, step + 0.5, step + 0.5);
    }
  }
  for (let k = 0; k <= cells; k += 1) {
    if (k % 3 !== 0) continue;
    const at = left + k * step;
    context.strokeStyle = k % (section.block * section.block) === 0 ? '#7bd1c0' : '#2a4a4f';
    context.lineWidth = k % (section.block * section.block) === 0 ? 1.5 : 1;
    context.beginPath();
    context.moveTo(at, top);
    context.lineTo(at, top + side);
    context.moveTo(left, top + k * step);
    context.lineTo(left + side, top + k * step);
    context.stroke();
  }
  context.fillStyle = TEXT;
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(
    `${section.block ** depth} leaves → ${section.block ** 2} blocks → ${section.block} → 1`,
    left + side / 2,
    top + side + 8,
  );
  context.fillText('one cell, three levels down', left + side / 2, top + side + 26);

  // Right: the error rate per level on a log scale. The recursion is a line; the built tower is
  // dots, so a disagreement between the two would be visible rather than averaged away.
  const frame = { left: 300, top: 46, width: 200, height: 240 };
  const floor = 1e-6;
  const y = logScale(floor, 1, frame.top + frame.height, frame.top);
  const x = (level: number) =>
    frame.left + ((level - 1) / Math.max(1, section.levels - 1)) * frame.width;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.lineWidth = 1;
  for (const tick of decadeTicks(floor, 1)) {
    const py = y(tick);
    context.strokeStyle = GRID;
    context.beginPath();
    context.moveTo(frame.left, py);
    context.lineTo(frame.left + frame.width, py);
    context.stroke();
    context.fillStyle = TEXT;
    context.fillText(tick < 1 ? tick.toExponential(0) : '1', frame.left - 6, py);
  }
  context.strokeStyle = '#2a323d';
  context.beginPath();
  context.moveTo(frame.left, frame.top);
  context.lineTo(frame.left, frame.top + frame.height);
  context.lineTo(frame.left + frame.width, frame.top + frame.height);
  context.stroke();

  const clamp = (value: number) => Math.max(floor, value);
  context.strokeStyle = NEC;
  context.lineWidth = 2;
  context.beginPath();
  curve.analytic.forEach((value, index) => {
    const px = x(index + 1);
    const py = y(clamp(value));
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.stroke();
  context.fillStyle = MARK;
  curve.measured.forEach((value, index) => {
    context.beginPath();
    context.arc(x(index + 1), y(clamp(value)), 3, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = TEXT;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (let level = 1; level <= section.levels; level += 1) {
    context.fillText(String(level), x(level), frame.top + frame.height + 8);
  }
  context.fillText('level', frame.left + frame.width / 2, frame.top + frame.height + 26);
  context.save();
  context.translate(288, frame.top + frame.height / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('error rate (log)', 0, 0);
  context.restore();
}

function renderTower(section: TowerSection, index: number): void {
  const rate = section.rates[index] ?? section.rates[0] ?? 0;
  const curve = curveFor(section, rate);
  if (!curve) return;
  towerInput.value = String(index);
  towerValue.textContent = formatRate(rate);
  towerNote.textContent = `${section.trials} trials · seed ${section.seed} · ${section.recursion}`;
  drawTower(section, curve);
  towerSummary.textContent = describeCurve(curve);
  towerCaption.textContent =
    `Error rate per level at ε = ${formatRate(rate)}. The line is the recursion, the dots are the ` +
    `tower actually built; a pedagogical analogue, not Gács's construction.`;
  towerTable.replaceChildren();
  // Level 1 holds block^(levels-1) nodes, down to the single root: leaves are level 0, not a row.
  const counts = nodesPerLevel(section.levels, section.block).slice(1);
  for (let level = 1; level <= section.levels; level += 1) {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = String(level);
    const nodes = document.createElement('td');
    nodes.className = 'num';
    nodes.textContent = String(counts[level - 1] ?? 0);
    const analytic = document.createElement('td');
    analytic.className = 'num';
    analytic.textContent = formatRate(curve.analytic[level - 1] ?? Number.NaN);
    const measured = document.createElement('td');
    measured.className = 'num';
    measured.textContent = formatRate(curve.measured[level - 1] ?? Number.NaN);
    row.append(head, nodes, analytic, measured);
    towerTable.append(row);
  }
  document.body.dataset.towerRate = String(rate);
}

async function start(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}products/stress/`;
  try {
    const response = await fetch(`${base}panel.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loaded = (await response.json()) as PanelDocument;
  } catch (error) {
    showError(
      `Cannot load the panel data: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const grid = loaded.noise.grid;
  noiseInput.min = '0';
  noiseInput.max = String(Math.max(0, grid.length - 1));
  const fallback = grid[Math.min(2, grid.length - 1)] ?? grid[0] ?? 0;
  const requested = readNoiseParam(new URL(location.href));
  const chosen =
    requested === null || Number.isNaN(requested)
      ? { value: fallback, matched: true }
      : nearestNoise(grid, requested);
  if (!chosen.matched) {
    noiseNote.textContent = `ε ${String(requested)} is not on the dyadic grid; showing ${formatNoise(chosen.value)}.`;
  }

  applyNoise(chosen.value, false);
  drawDk(loaded.dk);
  renderFits(loaded.dk);
  renderClaim(toomClaim, loaded.toom.claim);
  towerInput.max = String(Math.max(0, loaded.tower.rates.length - 1));
  towerClaim.textContent = loaded.tower.note;
  renderTower(loaded.tower, 0);

  dkSummary.textContent =
    `Active fraction over ${loaded.dk.cells.length} points, measured at L = ` +
    `${loaded.dk.diagram_lattice} for ${loaded.dk.diagram_steps} steps with seeds ` +
    `${loaded.dk.diagram_seeds.join(', ')}. The boundary is where the active fraction crosses ` +
    `one half; the ringed points are the bond and site directed-percolation critical points, ` +
    `quoted from the literature and not proved by this diagram.`;

  status.textContent =
    `${loaded.generator} · Toom seeds ${loaded.toom.seeds.join(', ')} · ` +
    `decay seeds ${loaded.dk.decay.seeds.length} per lattice · noise ${formatNoise(noise)}`;
  document.body.dataset.state = 'ready';
}

noiseInput.addEventListener('input', () => {
  const value = loaded?.noise.grid[Number(noiseInput.value)];
  if (value !== undefined) applyNoise(value, true);
});

dkCanvas.addEventListener('click', (event) => {
  if (!loaded) return;
  const rect = dkCanvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (dkCanvas.width / rect.width);
  const py = (event.clientY - rect.top) * (dkCanvas.height / rect.height);
  const frame = dkFrame(dkCanvas);
  const grid = loaded.dk.grid;
  const p1 = Math.round(((px - frame.left) / frame.width) * grid) / grid;
  const p2 = Math.round((1 - (py - frame.top) / frame.height) * grid) / grid;
  if (p1 < 0 || p1 > 1 || p2 < 0 || p2 > 1) return;
  const found = cellAt(loaded.dk.cells, p1, p2, grid);
  if (!found) return;
  dkReadout.textContent = describeCell(found);
});

towerInput.addEventListener('input', () => {
  if (!loaded) return;
  renderTower(loaded.tower, Number(towerInput.value));
});

window.addEventListener('popstate', () => {
  if (!loaded) return;
  const requested = readNoiseParam(new URL(location.href));
  if (requested === null || Number.isNaN(requested)) return;
  applyNoise(nearestNoise(loaded.noise.grid, requested).value, false);
});

void start();
