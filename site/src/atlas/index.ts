export { CHART_SIZE, indexOf, maskAt, ruleAt } from './lib/chart';
export { clampCamera, MAX_ZOOM, MIN_ZOOM, panBy, screenToChart, zoomAt, type Camera } from './lib/camera';
export { createAtlasRenderer, type AtlasRenderer, type AtlasView } from './lib/render';
export { loadAtlas, parseProduct, type AtlasData, type AtlasManifest, type Product } from './lib/product';
export {
  CLASS_COLOURS,
  CLASS_NAMES,
  classLegend,
  cssColour,
  disagreementColour,
  isHatchPixel,
  ramp,
  rampLegend,
  type ClassName,
  type LegendItem,
} from './lib/palette';
