import { DOMAdapter, type Texture } from 'pixi.js';

/** If the texture's source wraps an HTMLImageElement, sample it onto a canvas
 *  and swap the canvas in. The WebGPU renderer cannot ingest an `<img>` resource:
 *  on first upload it draws the element onto a canvas and logs a debug warning
 *  per texture. Sampling eagerly at load time avoids both the warning and the
 *  per-upload conversion. Atlas frames share a single source, so converting it
 *  once fixes every sliced frame. No-op for every other resource type. */
export function ensureCanvasResource(texture: Texture): void {
  const source = texture.source;
  const resource = source.resource;
  if (!globalThis.HTMLImageElement || !(resource instanceof HTMLImageElement)) return;
  const canvas = DOMAdapter.get().createCanvas(resource.width, resource.height);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(resource, 0, 0, resource.width, resource.height);
  source.resource = canvas;
}