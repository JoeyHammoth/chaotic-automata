// The panel product is base64 of packed bytes; decode it here, in one place, so the page never has
// to guess an encoding. The layouts are stated in the product itself (panel.json `encodings`).

export interface PanelClaim {
  text: string;
  source: string;
  verified: boolean;
}

export interface PanelDomain {
  description: string;
  pattern: (number | null)[];
  coverage: number;
  period: number;
}

export interface PanelRegion {
  description: string;
  walls_mean: number;
  wall_fraction: number;
  rows: number;
}

export interface PanelTrack {
  id: number;
  start: number;
  end: number;
  lifetime: number;
  velocity: number;
  period: [number, number] | null;
  cells: number;
  rows: [number, number][];
}

export interface PanelCollision {
  time: number;
  kind: string;
  inputs: number[];
  outputs: number[];
}

export interface PanelRule {
  version: number;
  rule: number;
  width: number;
  steps: number;
  seed: number;
  settle: number;
  radius: number;
  support: { dimension: string; radius: number; note: string };
  claim: PanelClaim | null;
  periodic: PanelDomain | null;
  region: PanelRegion | null;
  encodings: Record<string, string>;
  fields: { raw: string; filtered: string | null; complexity: string; damage: string };
  tracks: PanelTrack[];
  collisions: PanelCollision[];
  states: { count: number; past: number; future: number; undecided: number };
}

export interface PanelDocument {
  version: number;
  generator: string;
  seed: number;
  width: number;
  steps: number;
  settle: number;
  rules: PanelRule[];
}

export function bytesFromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function unpackBits(encoded: string, width: number, height: number): Uint8Array {
  const bytes = bytesFromBase64(encoded);
  const stride = Math.ceil(width / 8);
  if (bytes.length !== stride * height) {
    throw new Error(`expected ${stride * height} bytes, found ${bytes.length}`);
  }
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const byte = bytes[y * stride + (x >> 3)] ?? 0;
      cells[y * width + x] = (byte >> (x & 7)) & 1;
    }
  }
  return cells;
}

export function unpackLevels(encoded: string, width: number, height: number): Uint8Array {
  const bytes = bytesFromBase64(encoded);
  if (bytes.length !== width * height) {
    throw new Error(`expected ${width * height} bytes, found ${bytes.length}`);
  }
  return bytes;
}

export function readRuleParam(url: URL): number | null {
  const raw = url.searchParams.get('rule');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

export function readTrackParam(url: URL): number | null {
  const raw = url.searchParams.get('track');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}
