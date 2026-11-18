// Life-like rules in B/S notation. The canonical form here must match `ca_core::Rule::canonical`,
// because both the site and the pipeline write it into URLs and data products.

export interface Rule {
  readonly birth: number;
  readonly survival: number;
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function parseRule(text: string): Rule {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new RuleError('rule is empty; expected B<digits>/S<digits>, for example B3/S23');
  }
  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    throw new RuleError(
      `expected exactly one '/', found ${parts.length - 1} separators in '${trimmed}'`,
    );
  }
  return {
    birth: parseSet(parts[0] as string, 'B'),
    survival: parseSet(parts[1] as string, 'S'),
  };
}

export function canonicalRule(rule: Rule): string {
  return `B${digits(rule.birth)}/S${digits(rule.survival)}`;
}

export function ruleMask(rule: Rule): number {
  return (rule.birth | (rule.survival << 9)) >>> 0;
}

export function ruleFromMask(mask: number): Rule {
  return { birth: mask & 0x1ff, survival: (mask >>> 9) & 0x1ff };
}

export function nextState(rule: Rule, alive: boolean, neighbours: number): boolean {
  const mask = alive ? rule.survival : rule.birth;
  return ((mask >>> neighbours) & 1) === 1;
}

function digits(mask: number): string {
  let out = '';
  for (let count = 0; count <= 8; count++) {
    if (((mask >>> count) & 1) === 1) out += String(count);
  }
  return out;
}

function parseSet(part: string, prefix: 'B' | 'S'): number {
  const first = part[0];
  if (first === undefined) throw new RuleError(`missing '${prefix}' set`);
  if (first.toUpperCase() !== prefix) {
    throw new RuleError(`expected '${prefix}' at the start of '${part}', found '${first}'`);
  }
  let mask = 0;
  for (const char of part.slice(1)) {
    if (!/^[0-9]$/.test(char)) throw new RuleError(`'${char}' is not a digit in '${part}'`);
    const count = Number(char);
    if (count > 8) throw new RuleError(`neighbour count ${count} is out of range 0-8 in '${part}'`);
    mask |= 1 << count;
  }
  return mask;
}
