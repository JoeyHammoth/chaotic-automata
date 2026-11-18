// Drawing is deliberately boring: one ImageData, one putImageData, the browser scales the canvas.

export interface GridRenderer {
  draw(cells: Uint8Array): void;
  readonly width: number;
  readonly height: number;
}

const ALIVE: readonly [number, number, number] = [123, 209, 192];
const DEAD: readonly [number, number, number] = [8, 11, 15];

export function createGridRenderer(canvas: HTMLCanvasElement, width: number, height: number): GridRenderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('canvas 2d context is unavailable');

  canvas.width = width;
  canvas.height = height;
  const image = context.createImageData(width, height);

  return {
    width,
    height,
    draw(cells: Uint8Array): void {
      if (cells.length !== width * height) {
        throw new Error(`expected ${width * height} cells, got ${cells.length}`);
      }
      const data = image.data;
      for (let i = 0; i < cells.length; i++) {
        const colour = cells[i] === 1 ? ALIVE : DEAD;
        const offset = i * 4;
        data[offset] = colour[0];
        data[offset + 1] = colour[1];
        data[offset + 2] = colour[2];
        data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    },
  };
}
