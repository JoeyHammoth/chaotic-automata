import {
  readRuleParam,
  readTrackParam,
  unpackBits,
  unpackLevels,
  type PanelDocument,
  type PanelRule,
  type PanelTrack,
} from './lib/panel';

// Everything on this page is a static render of a recorded run: the product carries its seed and
// the panes are painted once per selection. There is no animation to disable, and the one smooth
// scroll is dropped when the reader asks for reduced motion.

const BACKGROUND: [number, number, number] = [8, 11, 15];
const ALIVE: [number, number, number] = [123, 209, 192];
const DAMAGE: [number, number, number] = [255, 143, 122];
const HIGHLIGHT = '#ffffff';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`page shell is missing ${selector}`);
  return element;
}

const ruleSelect = required<HTMLSelectElement>('#inspector-rule');
const rawCanvas = required<HTMLCanvasElement>('#pane-raw');
const filteredCanvas = required<HTMLCanvasElement>('#pane-filtered');
const complexityCanvas = required<HTMLCanvasElement>('#pane-complexity');
const damageCanvas = required<HTMLCanvasElement>('#pane-damage');
const filteredCaption = required<HTMLElement>('#filtered-caption');
const trackList = required<HTMLUListElement>('#track-list');
const trackCount = required<HTMLElement>('#track-count');
const detail = required<HTMLElement>('#track-detail');
const claimBox = required<HTMLElement>('#claim');
const domainBox = required<HTMLElement>('#domain-summary');
const status = required<HTMLElement>('#status');
const errorBox = required<HTMLElement>('#error');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let loaded: PanelDocument | null = null;
let rule: PanelRule | null = null;
let selected: number | null = null;

function showError(message: string): void {
  errorBox.hidden = false;
  errorBox.textContent = message;
  status.textContent = 'panel unavailable';
  document.body.dataset.state = 'error';
}

function paintBits(
  canvas: HTMLCanvasElement,
  bits: Uint8Array,
  width: number,
  height: number,
  colour: [number, number, number],
): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const source = bits[index] === 1 ? colour : BACKGROUND;
    image.data[offset] = source[0];
    image.data[offset + 1] = source[1];
    image.data[offset + 2] = source[2];
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function paintLevels(
  canvas: HTMLCanvasElement,
  levels: Uint8Array,
  width: number,
  height: number,
): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const value = (levels[index] ?? 0) / 255;
    const offset = index * 4;
    image.data[offset] = Math.round(16 + value * 107);
    image.data[offset + 1] = Math.round(20 + value * 189);
    image.data[offset + 2] = Math.round(26 + value * 166);
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function highlight(track: PanelTrack): void {
  const context = filteredCanvas.getContext('2d');
  if (!context) return;
  context.fillStyle = HIGHLIGHT;
  for (const [time, centre] of track.rows) {
    context.fillRect(centre - 0.5, time - 0.5, 2, 2);
  }
}

function renderClaim(current: PanelRule): void {
  claimBox.replaceChildren();
  if (current.claim) {
    const heading = document.createElement('p');
    heading.textContent = current.claim.text;
    const source = document.createElement('p');
    source.className = 'status';
    source.textContent = current.claim.source;
    const badge = document.createElement('span');
    badge.className = current.claim.verified ? 'badge verified' : 'badge unverified';
    badge.textContent = current.claim.verified
      ? 'verified by this code'
      : 'literature claim — not reproduced here';
    claimBox.append(heading, source, badge);
  } else if (!current.periodic && !current.region) {
    const heading = document.createElement('p');
    heading.textContent = 'No known domain decomposition.';
    const note = document.createElement('p');
    note.className = 'status';
    note.textContent =
      'Nothing is drawn as a domain and no particle is claimed, because there is no decomposition to draw.';
    claimBox.append(heading, note);
  } else {
    const heading = document.createElement('p');
    heading.textContent = 'No literature claim for this rule; the panes are measurements only.';
    claimBox.append(heading);
  }
}

function renderDomain(current: PanelRule): void {
  const parts: string[] = [];
  if (current.periodic) {
    parts.push(`periodic domain ${current.periodic.description}, coverage ${current.periodic.coverage}`);
  }
  if (current.region) {
    parts.push(
      `${current.region.description}: ${current.region.walls_mean.toFixed(2)} walls per row, worst row ${(
        current.region.wall_fraction * 100
      ).toFixed(1)}%`,
    );
  }
  if (parts.length === 0) parts.push('No domain: the residue pane is deliberately empty.');
  parts.push(`${current.states.count} local causal states`);
  domainBox.textContent = parts.join(' · ');
}

function detailFor(track: PanelTrack): string {
  const period =
    track.period === null
      ? 'period not measured within 32 rows'
      : `period (${track.period[0]} rows, ${track.period[1]} cells)`;
  const partners = (rule?.collisions ?? [])
    .filter((event) => event.inputs.includes(track.id) || event.outputs.includes(track.id))
    .map((event) => {
      const others = [...event.inputs, ...event.outputs].filter((id) => id !== track.id);
      return `${event.kind} at row ${event.time} with ${others.length} other track(s)`;
    });
  return [
    `Particle ${track.id}: rows ${track.start}–${track.end} (${track.lifetime} rows)`,
    `velocity ${track.velocity.toFixed(2)} cells per step`,
    period,
    partners.length === 0 ? 'no collision partners recorded' : partners.join('; '),
  ].join(' · ');
}

function select(id: number | null, focus = false): void {
  selected = id;
  for (const button of trackList.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.track === String(id)));
    if (focus && button.dataset.track === String(id)) button.focus();
  }
  if (!rule) return;
  const found = rule.tracks.find((track) => track.id === id);
  detail.textContent = found
    ? detailFor(found)
    : 'Select a particle to see its velocity, period and collision partners.';
  if (rule.fields.filtered !== null) {
    const height = rule.steps + 1 - rule.settle;
    paintBits(filteredCanvas, unpackBits(rule.fields.filtered, rule.width, height), rule.width, height, ALIVE);
    if (found) highlight(found);
  }
  syncUrl();
}

function renderTracks(current: PanelRule): void {
  trackList.replaceChildren();
  if (current.tracks.length === 0) {
    const item = document.createElement('li');
    item.className = 'status';
    item.textContent =
      'No particle is listed: without a domain there is nothing to filter, so nothing is drawn.';
    trackList.append(item);
    trackCount.textContent = '0 particles';
    return;
  }
  trackCount.textContent = `${current.tracks.length} particles`;
  for (const track of current.tracks) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.track = String(track.id);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = `particle ${track.id} · rows ${track.start}–${track.end} · velocity ${track.velocity.toFixed(2)}`;
    button.addEventListener('click', () => select(track.id));
    item.append(button);
    trackList.append(item);
  }
}

function render(current: PanelRule): void {
  rule = current;
  const height = current.steps + 1 - current.settle;
  paintBits(rawCanvas, unpackBits(current.fields.raw, current.width, height), current.width, height, ALIVE);
  if (current.fields.filtered !== null) {
    paintBits(
      filteredCanvas,
      unpackBits(current.fields.filtered, current.width, height),
      current.width,
      height,
      ALIVE,
    );
    filteredCaption.textContent =
      'Domain residue: the wall columns and any cell the domain does not explain.';
  } else {
    paintBits(filteredCanvas, new Uint8Array(current.width * height), current.width, height, ALIVE);
    filteredCaption.textContent =
      'No domain decomposition: nothing is filtered, and nothing is invented to fill the pane.';
  }
  paintLevels(
    complexityCanvas,
    unpackLevels(current.fields.complexity, current.width, height),
    current.width,
    height,
  );
  paintBits(
    damageCanvas,
    unpackBits(current.fields.damage, current.width, height),
    current.width,
    height,
    DAMAGE,
  );
  renderClaim(current);
  renderDomain(current);
  renderTracks(current);
  selected = null;
  detail.textContent = 'Select a particle to see its velocity, period and collision partners.';
  status.textContent =
    `rule ${current.rule} · ${current.width} cells · ${height} rows · seed ${current.seed} · ` +
    `radius ${current.radius} · ${current.support.dimension}`;
  document.body.dataset.state = 'ready';
  document.body.dataset.rule = String(current.rule);
  document.body.dataset.tracks = String(current.tracks.length);
  ruleSelect.value = String(current.rule);
}

function syncUrl(): void {
  if (!rule) return;
  const url = new URL(location.href);
  url.searchParams.set('rule', String(rule.rule));
  if (selected === null) url.searchParams.delete('track');
  else url.searchParams.set('track', String(selected));
  if (url.href !== location.href) history.replaceState(null, '', url);
}

trackList.addEventListener('keydown', (event) => {
  const buttons = [...trackList.querySelectorAll<HTMLButtonElement>('button')];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  const next =
    event.key === 'ArrowDown'
      ? index + 1
      : event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  buttons[(next + buttons.length) % buttons.length]?.focus();
});

filteredCanvas.addEventListener('click', (event) => {
  if (!rule || rule.fields.filtered === null) return;
  const rect = filteredCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (filteredCanvas.width / rect.width));
  const y = Math.floor((event.clientY - rect.top) * (filteredCanvas.height / rect.height));
  let best: { track: PanelTrack; distance: number } | null = null;
  for (const track of rule.tracks) {
    for (const [time, centre] of track.rows) {
      const distance = Math.abs(time - y) * 4 + Math.abs(centre - x);
      if (time === y && Math.abs(centre - x) <= 3 && (best === null || distance < best.distance)) {
        best = { track, distance };
      }
    }
  }
  if (best === null) return;
  select(best.track.id, true);
  const target = trackList.querySelector<HTMLButtonElement>(`button[data-track="${best.track.id}"]`);
  target?.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
});

ruleSelect.addEventListener('change', () => {
  const next = loaded?.rules.find((entry) => entry.rule === Number(ruleSelect.value));
  if (next) render(next);
});

async function start(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}products/inspector/`;
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

  for (const entry of loaded.rules) {
    const option = document.createElement('option');
    option.value = String(entry.rule);
    option.textContent = `rule ${entry.rule}`;
    ruleSelect.append(option);
  }

  const requested = readRuleParam(new URL(location.href));
  const found = loaded.rules.find((entry) => entry.rule === requested) ?? loaded.rules[0];
  if (!found) {
    showError('The panel product contains no rules.');
    return;
  }
  if (requested !== null && !loaded.rules.some((entry) => entry.rule === requested)) {
    showError(
      `Rule ${String(Number.isNaN(requested) ? '?' : requested)} is not in the panel product. ` +
        'It ships rules 18, 30 and 36 only; 1D binary radius 1–2 is the supported scope.',
    );
  }
  render(found);
  window.addEventListener('popstate', () => {
    const next = readRuleParam(new URL(location.href));
    const match = loaded?.rules.find((entry) => entry.rule === next);
    if (match) render(match);
  });
  const wanted = readTrackParam(new URL(location.href));
  if (wanted !== null) select(wanted);
}

void start();
