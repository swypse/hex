import { describe, expect, it } from 'vitest';
import { Rectangle } from 'pixi.js';
import { CameraController, type CameraContext } from '../src/controller/cameraController';

function makeCamera(overrides: Partial<CameraContext> = {}): CameraController {
  const ctx: CameraContext = {
    app: null,
    hexSize: 40,
    screenWidth: () => 800,
    mapHeight: () => 600,
    mapRadius: () => 2,
    onCameraChange: () => {},
    ...overrides,
  };
  return new CameraController(ctx);
}

describe('CameraController.viewportRect', () => {
  it('covers the whole visible screen in container-local coordinates', () => {
    const cam = makeCamera();
    cam.baseScale = 2;
    cam.zoom = 1;
    cam.pan = { x: 100, y: 50 };
    const r = cam.viewportRect();
    expect(r).toEqual(new Rectangle(-100 / 2, -50 / 2, 800 / 2, 600 / 2));
  });

  it('scales with zoom so empty space around a zoomed-out map stays draggable', () => {
    const cam = makeCamera();
    cam.baseScale = 1;
    cam.zoom = 0.5;
    cam.pan = { x: 400, y: 300 };
    const r = cam.viewportRect();
    expect(r).toEqual(new Rectangle(-400 / 0.5, -300 / 0.5, 800 / 0.5, 600 / 0.5));
  });
});
