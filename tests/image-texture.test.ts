import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImageSource, Texture, type ImageResource } from 'pixi.js';
import { ensureCanvasResource } from '../src/render/image-texture';

class FakeImage {
  width = 10;
  height = 8;
}

class FakeCanvas {
  width = 10;
  height = 8;
  drawn: unknown[] = [];
  getContext(): { drawImage: (img: unknown) => void } {
    return { drawImage: (img) => { this.drawn.push(img); } };
  }
}

describe('ensureCanvasResource', () => {
  let origImage: unknown;
  let origCanvas: unknown;
  let origDocument: unknown;

  beforeEach(() => {
    origImage = (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement;
    origCanvas = (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement;
    origDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = FakeImage;
    (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement = FakeCanvas;
    (globalThis as { document?: unknown }).document = {
      createElement: (): FakeCanvas => new FakeCanvas(),
    };
  });

  afterEach(() => {
    (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = origImage;
    (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement = origCanvas;
    (globalThis as { document?: unknown }).document = origDocument;
  });

  it('leaves a non-image resource untouched', () => {
    const texture = new Texture({ source: new ImageSource({ resource: undefined, width: 1, height: 1 }) });
    expect(texture.source.resource).toBeUndefined();
    ensureCanvasResource(texture);
    expect(texture.source.resource).toBeUndefined();
  });

  it('samples an image element onto a canvas and swaps it in', () => {
    const img = new FakeImage();
    const texture = new Texture({
      source: new ImageSource({ resource: img as unknown as ImageResource }),
    });
    expect(texture.source.resource).toBeInstanceOf(FakeImage);
    ensureCanvasResource(texture);
    const canvas = texture.source.resource as unknown as FakeCanvas;
    expect(canvas).toBeInstanceOf(FakeCanvas);
    expect(canvas.drawn).toEqual([img]);
  });
});