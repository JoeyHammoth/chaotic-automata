// The `CATL` reader from design §5.4. A reader that ignores `version` is a bug, so this one refuses a
// schema it does not know and says so in the visible error, not in the console.

export const MAGIC = 'CATL';
export const VERSION = 1;
// magic(4) + version(2) + dtype(1) + channels(1) + width(4) + height(4) + scale(4) + flags(4).
export const HEADER_BYTES = 24;

export type Dtype = 1 | 2 | 3;

export interface ProductMeta {
  version: number;
  dtype: Dtype;
  channels: number;
  width: number;
  height: number;
  scale: number;
  flags: number;
}

export interface Product {
  meta: ProductMeta;
  floats: Float32Array;
  bytes: Uint8Array | null;
}

function halfToFloat(bits: number): number {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

export function parseProduct(buffer: ArrayBuffer): Product {
  if (buffer.byteLength < HEADER_BYTES) throw new Error('product is shorter than its header');
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== MAGIC) throw new Error(`not a product file: magic is '${magic}'`);
  const version = view.getUint16(4, true);
  if (version !== VERSION) throw new Error(`product schema ${version} is not supported`);
  const meta: ProductMeta = {
    version,
    dtype: view.getUint8(6) as Dtype,
    channels: view.getUint8(7),
    width: view.getUint32(8, true),
    height: view.getUint32(12, true),
    scale: view.getFloat32(16, true),
    flags: view.getUint32(20, true),
  };
  const count = meta.width * meta.height * meta.channels;
  const body = buffer.slice(HEADER_BYTES);

  if (meta.dtype === 3) {
    const bytes = new Uint8Array(body);
    if (bytes.length !== count) throw new Error('u8 product has the wrong length');
    return { meta, floats: new Float32Array(0), bytes };
  }
  if (meta.dtype === 1) {
    const raw = new Uint16Array(body);
    if (raw.length !== count) throw new Error('fp16 product has the wrong length');
    const floats = new Float32Array(count);
    for (let i = 0; i < count; i += 1) floats[i] = halfToFloat(raw[i] ?? 0);
    return { meta, floats, bytes: null };
  }
  if (meta.dtype === 2) {
    const floats = new Float32Array(body);
    if (floats.length !== count) throw new Error('f32 product has the wrong length');
    return { meta, floats, bytes: null };
  }
  throw new Error(`unsupported dtype ${String(meta.dtype)}`);
}

export interface AtlasManifest {
  kind: string;
  profile: string;
  git_sha: string;
  seeds: number[];
  budgets: Record<string, unknown>;
  space: {
    tile: [number, number];
    landmarks: { name: string; rule: string; birth_index: number; survival_index: number }[];
  };
  layers: { metric: string; path: string; min: number; max: number; bytes: number }[];
  classes: { path: string; channels: string[]; names: string[]; counts: Record<string, number> };
}

export interface AtlasData {
  manifest: AtlasManifest;
  width: number;
  height: number;
  layers: Map<string, Float32Array>;
  classes: Uint8Array;
}

export async function loadAtlas(base: string, fetchImpl: typeof fetch = fetch): Promise<AtlasData> {
  const manifestUrl = `${base}manifest.json`;
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) throw new Error(`cannot load ${manifestUrl}: ${response.status}`);
  const manifest = (await response.json()) as AtlasManifest;

  const layers = new Map<string, Float32Array>();
  for (const layer of manifest.layers) {
    const layerResponse = await fetchImpl(`${base}${layer.path}`);
    if (!layerResponse.ok) throw new Error(`cannot load ${layer.path}: ${layerResponse.status}`);
    layers.set(layer.metric, parseProduct(await layerResponse.arrayBuffer()).floats);
  }

  const classResponse = await fetchImpl(`${base}${manifest.classes.path}`);
  if (!classResponse.ok) throw new Error(`cannot load ${manifest.classes.path}`);
  const parsedClasses = parseProduct(await classResponse.arrayBuffer());
  const classes = parsedClasses.bytes;
  if (!classes) throw new Error('classes product is not u8');

  return {
    manifest,
    width: parsedClasses.meta.width,
    height: parsedClasses.meta.height,
    layers,
    classes,
  };
}
