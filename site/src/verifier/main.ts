// The Verifier page: it renders the pipeline's own verdicts and never computes one. Every number on
// screen comes from products/verifier/manifest.json, so the page cannot disagree with the run.

import {
  certificateSummary,
  checkSummary,
  cryptidSummary,
  cryptidTraceChart,
  cryptidTraceLine,
  formatSteps,
  loadVerifier,
  residue,
  verdictBadge,
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

function cell(text: string, scope?: 'row'): HTMLTableCellElement {
  const node = document.createElement(scope === 'row' ? 'th' : 'td');
  if (scope === 'row') node.scope = 'row';
  node.textContent = text;
  return node;
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
      cell(run.quoted === null ? '—' : run.quoted.toLocaleString('en-US')),
      cell(run.reproduced === null ? '—' : run.reproduced.toLocaleString('en-US')),
      cell(run.machines.toLocaleString('en-US')),
      cell(run.halting.toLocaleString('en-US')),
      cell(run.certified.toLocaleString('en-US')),
      cell(run.heuristic.toLocaleString('en-US')),
      cell(run.undecided.toLocaleString('en-US')),
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
    klass.textContent = `${badge.symbol} ${badge.text}`;
    row.append(
      machine,
      cell(String(entry.states)),
      klass,
      cell(formatSteps(entry.steps)),
      cell(checkSummary(entry)),
    );
    body.append(row);
  }
}

const SVG = 'http://www.w3.org/2000/svg';

/** The span over a hundred million steps, drawn small. The sentence beside it carries the numbers. */
function traceChart(trace: CryptidTrace): SVGSVGElement {
  const chart = cryptidTraceChart(trace);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 132 44');
  svg.setAttribute('width', '132');
  svg.setAttribute('height', '44');
  svg.setAttribute('class', 'trace');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', chart.label);
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
    dot.setAttribute('fill', 'currentColor');
    svg.append(dot);
  }
  return svg;
}

function renderCryptids(product: VerifierProduct): void {
  const body = element<HTMLTableSectionElement>('cryptid-table');
  body.replaceChildren();
  for (const cryptid of product.cryptids) {
    const summary = cryptidSummary(cryptid);
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = cryptid.name;
    const machine = document.createElement('td');
    machine.className = 'certificate';
    machine.textContent = cryptid.string;
    const mine = document.createElement('td');
    mine.append(
      traceChart(cryptid.trace),
      document.createTextNode(
        `${summary.verdict} — ${summary.proves}. ${cryptidTraceLine(cryptid.trace)}.`,
      ),
    );
    row.append(
      name,
      cell(cryptid.domain),
      machine,
      cell(`${cryptid.claim} (${cryptid.found})`),
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
      cell(mutation.accepted ? 'accepted' : 'refused'),
      cell(mutation.reason),
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

function render(product: VerifierProduct): void {
  renderResidue(product);
  renderBb(product);
  renderLabelled(product);
  renderCryptids(product);
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
  element('status').textContent =
    `product v${product.version}, seed ${product.seed}, cap ${product.cap} steps, ` +
    `fingerprints every ${product.check_every} steps.`;
}

loadVerifier(base)
  .then(render)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const banner = element('error');
    banner.textContent = `Cannot read the verifier product: ${message}`;
    banner.hidden = false;
    element('status').textContent = 'the page has nothing to draw until the product loads';
  });
