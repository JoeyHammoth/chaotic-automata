// The Verifier page: it renders the pipeline's own verdicts and never computes one. Every number on
// screen comes from the product files in products/verifier — the producer's manifest, and the
// mirror's ladder beside it — so the page cannot disagree with either run.

import {
  certificateSummary,
  checkSummary,
  cryptidGrowthChart,
  cryptidLadderChart,
  cryptidLadderLine,
  cryptidSummary,
  cryptidTraceLine,
  formatSteps,
  growthBarLine,
  loadLadder,
  tracePointLine,
  loadVerifier,
  residue,
  verdictBadge,
  type CryptidLadder,
  type CryptidTrace,
  type Labelled,
  type VerifierProduct,
} from './lib/verifier';

const base = import.meta.env.BASE_URL;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the page is missing #${id}`);
  return found as T;
}

function cell(text: string, scope?: 'row', label?: string): HTMLTableCellElement {
  const node = document.createElement(scope === 'row' ? 'th' : 'td');
  if (scope === 'row') node.scope = 'row';
  if (label !== undefined) node.dataset.label = label;
  node.textContent = text;
  return node;
}

/**
 * Which run a chart element belongs to, in words. The bars and points say it the same way.
 */
function runLabel(mirror: boolean): string {
  return mirror ? "the mirror's longer run" : "the product's own samples";
}

/**
 * The narrow layout stacks each row into a card, which drops the table semantics HTML gives those
 * elements. Explicit roles put them back, so a screen reader still hears a table with headers and
 * cells rather than a list of blocks.
 */
function keepTableSemantics(): void {
  for (const table of document.querySelectorAll<HTMLTableElement>('table.data')) {
    table.setAttribute('role', 'table');
    for (const group of table.querySelectorAll('thead, tbody')) {
      group.setAttribute('role', 'rowgroup');
    }
    for (const row of table.querySelectorAll('tr')) row.setAttribute('role', 'row');
    for (const header of table.querySelectorAll('th')) {
      header.setAttribute('role', header.scope === 'row' ? 'rowheader' : 'columnheader');
    }
    for (const data of table.querySelectorAll('td')) data.setAttribute('role', 'cell');
  }
}

function renderResidue(product: VerifierProduct): void {
  const total = residue(product.runs);
  element('residue').textContent =
    `${total.undecided.toLocaleString('en-US')} of ${total.machines.toLocaleString('en-US')} ` +
    `machines are undecided, and ${total.heuristic.toLocaleString('en-US')} more are only ` +
    'heuristically non-halting.';
  element('residue-note').textContent =
    'Undecided means the machine reached the step cap and nothing was proved about it. It is not a ' +
    'non-halting machine, and no table on this page counts it as one.';
}

function renderBb(product: VerifierProduct): void {
  const body = element<HTMLTableSectionElement>('bb-table');
  body.replaceChildren();
  for (const run of product.runs) {
    const row = document.createElement('tr');
    row.append(
      cell(String(run.states), 'row'),
      cell(run.quoted === null ? '—' : run.quoted.toLocaleString('en-US'), undefined, 'S(n) quoted'),
      cell(
        run.reproduced === null ? '—' : run.reproduced.toLocaleString('en-US'),
        undefined,
        'reproduced',
      ),
      cell(run.machines.toLocaleString('en-US'), undefined, 'machines'),
      cell(run.halting.toLocaleString('en-US'), undefined, 'halts'),
      cell(run.certified.toLocaleString('en-US'), undefined, 'certified'),
      cell(run.heuristic.toLocaleString('en-US'), undefined, 'heuristic'),
      cell(run.undecided.toLocaleString('en-US'), undefined, 'undecided'),
    );
    body.append(row);
  }
  const champion = product.champion;
  const note = document.createElement('p');
  note.textContent =
    `S(5) = ${champion.quoted.toLocaleString('en-US')} is quoted, not re-proved. Its champion ` +
    `${champion.string} halts after ${formatSteps(champion.steps)} steps when this pipeline runs ` +
    `it. Source: ${champion.source}.`;
  element('champion').replaceChildren(note);
}

function renderLabelled(product: VerifierProduct): void {
  const body = element<HTMLTableSectionElement>('labelled-table');
  body.replaceChildren();
  for (const entry of product.labelled) {
    const badge = verdictBadge(entry.verdict);
    const row = document.createElement('tr');
    const machine = document.createElement('th');
    machine.scope = 'row';
    machine.append(document.createTextNode(entry.string));
    const klass = document.createElement('td');
    klass.className = `badge ${badge.className}`;
    klass.dataset.label = 'class';
    klass.textContent = `${badge.symbol} ${badge.text}`;
    row.append(
      machine,
      cell(String(entry.states), undefined, 'states'),
      klass,
      cell(formatSteps(entry.steps), undefined, 'steps'),
      cell(checkSummary(entry), undefined, 'checker'),
    );
    body.append(row);
  }
}

const SVG = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 132;
const CHART_HEIGHT = 44;

/** The box both charts live in: one size, one role, one spoken label. */
function chartSvg(className: string, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  svg.setAttribute('width', String(CHART_WIDTH));
  svg.setAttribute('height', String(CHART_HEIGHT));
  svg.setAttribute('class', className);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  return svg;
}

/** A point or bar the product's own run does not reach is drawn hollow, never filled in. */
function markOutOfProduct(shape: SVGElement, mirror: boolean): void {
  if (!mirror) {
    shape.setAttribute('fill', 'currentColor');
    return;
  }
  shape.setAttribute('fill', 'none');
  shape.setAttribute('stroke', 'currentColor');
  shape.setAttribute('stroke-width', '1.2');
}

/** A chart with its caption beneath it, so the two charts can sit side by side. */
function chartFigure(svg: SVGSVGElement, text: string): HTMLSpanElement {
  const figure = document.createElement('span');
  figure.className = 'chart-figure';
  figure.append(svg, caption(text));
  return figure;
}

/**
 * The span over the product's billion steps and the mirror's decade beyond it, drawn small. The
 * sentence beside it carries the numbers; a hollow dot is a point only the longer run reaches.
 */
function traceChart(trace: CryptidTrace, ladder?: CryptidTrace): SVGSVGElement {
  const chart = cryptidLadderChart(trace, ladder);
  const svg = chartSvg('trace', chart.label);
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute(
    'points',
    chart.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
  );
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  svg.append(line);
  for (const point of chart.points) {
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('cx', point.x.toFixed(1));
    dot.setAttribute('cy', point.y.toFixed(1));
    dot.setAttribute('r', '1.8');
    markOutOfProduct(dot, point.mirror === true);
    const title = document.createElementNS(SVG, 'title');
    title.textContent = `${tracePointLine(point)} (${runLabel(point.mirror === true)})`;
    dot.append(title);
    svg.append(dot);
  }
  return svg;
}

/**
 * The span gained per decade, drawn under the trace. The mirror's last decade is hollow for the same
 * reason its point is: that decade belongs to the longer run, not to the product.
 */
function growthChart(trace: CryptidTrace, ladder?: CryptidTrace): SVGSVGElement {
  const chart = cryptidGrowthChart(trace, ladder);
  const svg = chartSvg('growth', chart.label);
  for (const bar of chart.bars) {
    const rect = document.createElementNS(SVG, 'rect');
    rect.setAttribute('x', bar.x.toFixed(1));
    rect.setAttribute('y', bar.y.toFixed(1));
    rect.setAttribute('width', bar.width.toFixed(1));
    rect.setAttribute('height', bar.height.toFixed(1));
    markOutOfProduct(rect, bar.mirror);
    // A pointer can read the same sentence the label carries, without a screen reader.
    const title = document.createElementNS(SVG, 'title');
    title.textContent = `${growthBarLine(bar)} (${runLabel(bar.mirror)})`;
    rect.append(title);
    svg.append(rect);
  }
  return svg;
}

function caption(text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = 'chart-caption';
  node.textContent = text;
  return node;
}

function renderCryptids(product: VerifierProduct, ladder: CryptidLadder | null): void {
  const body = element<HTMLTableSectionElement>('cryptid-table');
  body.replaceChildren();
  for (const cryptid of product.cryptids) {
    const summary = cryptidSummary(cryptid);
    const longer = ladder?.machines.find((entry) => entry.name === cryptid.name);
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = cryptid.name;
    const machine = document.createElement('td');
    machine.className = 'certificate';
    machine.dataset.label = 'machine';
    machine.textContent = cryptid.string;
    const mine = document.createElement('td');
    const charts = document.createElement('div');
    charts.className = 'charts';
    charts.append(
      chartFigure(traceChart(cryptid.trace, longer), 'span by step'),
      chartFigure(growthChart(cryptid.trace, longer), 'span gained per decade'),
    );
    const prose = document.createElement('p');
    prose.className = 'cryptid-run';
    prose.textContent =
      `${summary.verdict} — ${summary.proves}. ${cryptidTraceLine(cryptid.trace)}.` +
      (longer === undefined ? '' : ` ${cryptidLadderLine(cryptid.trace, longer)}.`);
    mine.append(charts, prose);
    mine.dataset.label = 'this pipeline';
    row.append(
      name,
      cell(cryptid.domain, undefined, 'domain'),
      machine,
      cell(`${cryptid.claim} (${cryptid.found})`, undefined, 'the wiki says'),
      mine,
    );
    body.append(row);
  }
  element('cryptid-note').textContent =
    'The strings are quoted from the bbchallenge wiki and round-trip through this parser exactly. ' +
    'The cap is the same 256 steps used everywhere on this page; for a cryptid it is not evidence, ' +
    'which is why no row here is counted as decided.';
}

function renderCertificate(product: VerifierProduct, entry: Labelled): void {
  element('certificate-summary').textContent =
    `${entry.string}: ${certificateSummary(entry.certificate)}`;
  element('certificate-json').textContent =
    entry.certificate === null
      ? 'no certificate: the decider guessed and the checker refused the guess'
      : JSON.stringify(entry.certificate, null, 2);
  element('certificate-check').textContent = checkSummary(entry);
  const body = element<HTMLTableSectionElement>('mutation-table');
  body.replaceChildren();
  if (entry.mutations.length === 0) {
    const row = document.createElement('tr');
    const only = cell('none recorded');
    only.colSpan = 3;
    row.append(only);
    body.append(row);
    return;
  }
  for (const mutation of entry.mutations) {
    const row = document.createElement('tr');
    row.append(
      cell(mutation.label, 'row'),
      cell(mutation.accepted ? 'accepted' : 'refused', undefined, 'checker'),
      cell(mutation.reason, undefined, 'reason'),
    );
    body.append(row);
  }
}

function renderClaims(product: VerifierProduct): void {
  const list = element<HTMLUListElement>('claims');
  list.replaceChildren();
  for (const claim of product.claims) {
    const item = document.createElement('li');
    item.textContent = `${claim.text} — ${claim.source}`;
    list.append(item);
  }
}

function render(product: VerifierProduct, ladder: CryptidLadder | null): void {
  renderResidue(product);
  renderBb(product);
  renderLabelled(product);
  renderCryptids(product, ladder);
  renderClaims(product);
  const select = element<HTMLSelectElement>('certificate-select');
  select.replaceChildren();
  for (const [index, entry] of product.labelled.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${entry.string} (${entry.verdict})`;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const chosen = product.labelled[Number(select.value)];
    if (chosen !== undefined) renderCertificate(product, chosen);
  });
  const first = product.labelled[0];
  if (first !== undefined) renderCertificate(product, first);
  keepTableSemantics();
  element('status').textContent =
    `product v${product.version}, seed ${product.seed}, cap ${product.cap} steps, ` +
    `fingerprints every ${product.check_every} steps` +
    (ladder === null
      ? '.'
      : `; the mirror's ladder reaches ${ladder.steps.toLocaleString('en-US')} steps.`);
}

Promise.all([loadVerifier(base), loadLadder(base).catch(() => null)])
  .then(([product, ladder]) => render(product, ladder))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const banner = element('error');
    banner.textContent = `Cannot read the verifier product: ${message}`;
    banner.hidden = false;
    element('status').textContent = 'the page has nothing to draw until the product loads';
  });
