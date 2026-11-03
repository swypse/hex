/** The WebGPU device's preferred canvas texture format (e.g. 'rgba8unorm').
 *  Configuring the app's root canvas to this format avoids a per-frame
 *  format-conversion copy in the render target. Same API Pixi uses internally;
 *  falls back to undefined where WebGPU is unavailable. */
export function preferredCanvasFormat(): string | undefined {
  try {
    const gpu = (navigator as { gpu?: { getPreferredCanvasFormat?: () => string } }).gpu;
    return gpu?.getPreferredCanvasFormat?.();
  } catch {
    return undefined;
  }
}
