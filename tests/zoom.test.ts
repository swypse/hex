import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  clampPan,
  zoomAroundCursor,
  qualityFactor,
  decayVelocity,
  inertiaStep,
  easeInOutCubic,
  cameraPanStep,
  maxZoomFor,
  fitScaleFor,
  PAN_PADDING,
} from '../src/game/zoom';

describe('clampZoom', () => {
  it('clamps to [0.5, 3]', () => {
    expect(clampZoom(0.3)).toBe(0.5);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(5)).toBe(3);
  });
});

describe('zoomAroundCursor', () => {
  it('keeps the world point under the cursor fixed', () => {
    const cursor = { x: 300, y: 200 };
    const pos = { x: 100, y: 50 };
    const scale = 1;
    const next = zoomAroundCursor(cursor, pos, scale, 2);
    expect(next.x).toBeCloseTo(-100);
    expect(next.y).toBeCloseTo(-100);
  });
});

describe('clampPan', () => {
  it('keeps the map within padding distance of the screen edges horizontally', () => {
    const radius = 6; // map wider than the 800px screen
    const hexSize = 40;
    const scale = 1;
    const screenW = 800;
    const padX = PAN_PADDING * screenW;
    const halfW = Math.sqrt(3) * radius * hexSize * scale;
    // map spans [pan.x-halfW, pan.x+halfW]; each edge may sit at most padX inside the screen
    for (const px of [-9999, 0, 400, 9999]) {
      const clamped = clampPan({ x: px, y: 0 }, radius, hexSize, scale, screenW, 600, 1);
      expect(clamped.x - halfW).toBeLessThanOrEqual(padX);
      expect(clamped.x + halfW).toBeGreaterThanOrEqual(screenW - padX);
    }
  });

  it('keeps the map within padding distance of the screen edges vertically with tilt', () => {
    const radius = 6;
    const hexSize = 40;
    const scale = 2;
    const tilt = 0.7;
    const screenH = 600;
    const padY = PAN_PADDING * screenH;
    const halfH = 1.5 * radius * hexSize * scale * tilt;
    const eps = 1e-3;
    for (const py of [-9999, 0, 300, 9999]) {
      const clamped = clampPan({ x: 0, y: py }, radius, hexSize, scale, 800, screenH, tilt);
      expect(clamped.y - halfH).toBeLessThanOrEqual(padY + eps);
      expect(clamped.y + halfH).toBeGreaterThanOrEqual(screenH - padY - eps);
    }
  });

  it('does not force a small map to the screen center', () => {
    const radius = 1;
    const hexSize = 40;
    const screenW = 800;
    const screenH = 600;
    const clamped = clampPan({ x: 300, y: 200 }, radius, hexSize, 1, screenW, screenH, 1);
    expect(clamped.x).toBeCloseTo(300);
    expect(clamped.y).toBeCloseTo(200);
  });

  it('keeps a small map fully visible when dragged to an extreme', () => {
    const radius = 1;
    const hexSize = 40;
    const screenW = 800;
    const screenH = 600;
    const halfW = Math.sqrt(3) * radius * hexSize;
    const halfH = 1.5 * radius * hexSize;
    const clamped = clampPan({ x: 9999, y: 9999 }, radius, hexSize, 1, screenW, screenH, 1);
    expect(clamped.x).toBeCloseTo(screenW - halfW);
    expect(clamped.y).toBeCloseTo(screenH - halfH);
  });
});

describe('qualityFactor', () => {
  it('is baseScale * maxZoom * devicePixelRatio up to the cap', () => {
    expect(qualityFactor(0.5, 1)).toBeCloseTo(1.5);
    expect(qualityFactor(0.5, 1, 4)).toBeCloseTo(2);
  });

  it('caps the result so high-DPR devices do not explode texture memory', () => {
    expect(qualityFactor(0.5, 3)).toBeLessThanOrEqual(4);
    expect(qualityFactor(2, 3)).toBeLessThanOrEqual(4);
    expect(qualityFactor(1.5, 2)).toBeCloseTo(4);
  });
});

describe('maxZoomFor', () => {
  it('is base 3 on wide/squarish screens and higher on tall screens', () => {
    expect(maxZoomFor(0.5)).toBe(3);
    expect(maxZoomFor(1)).toBe(3);
    expect(maxZoomFor(2)).toBe(5);
    expect(maxZoomFor(3)).toBe(5);
  });
});

describe('fitScaleFor', () => {
  it('uses the width fit on wide screens and leans to the height fit on tall screens', () => {
    const mapW = 1000;
    const mapH = 600;
    const wide = fitScaleFor(1600, 900, mapW, mapH);
    const square = fitScaleFor(1000, 1000, mapW, mapH);
    const tall = fitScaleFor(500, 1500, mapW, mapH);
    expect(wide).toBeCloseTo((1600 / mapW) * 0.9);
    expect(square).toBeCloseTo((1000 / mapW) * 0.9);
    expect(tall).toBeCloseTo((1500 / mapH) * 0.9);
    expect(tall).toBeGreaterThan(square);
  });
});

describe('decayVelocity', () => {
  it('decays velocity over time', () => {
    const v = decayVelocity({ x: 100, y: 0 }, 1);
    expect(v.x).toBeCloseTo(1);
  });
  it('leaves velocity unchanged at dt=0', () => {
    const v = decayVelocity({ x: 50, y: -30 }, 0);
    expect(v.x).toBeCloseTo(50);
    expect(v.y).toBeCloseTo(-30);
  });
});

describe('inertiaStep', () => {
  it('moves pan by velocity and decays it', () => {
    const result = inertiaStep({ x: 100, y: 100 }, { x: 60, y: 0 }, 0.1, 6, 40, 2, 1920, 1080, 1);
    expect(result.pan.x).toBeGreaterThan(100);
    expect(result.velocity.x).toBeLessThan(60);
    expect(result.done).toBe(false);
  });
  it('is done when velocity slows below the stop speed', () => {
    const result = inertiaStep({ x: 100, y: 100 }, { x: 10, y: 0 }, 1, 6, 40, 2, 1920, 1080, 1);
    expect(result.done).toBe(true);
  });
  it('stops when pinned at a boundary', () => {
    const radius = 6;
    const hexSize = 40;
    const scale = 3; // map wider than the 1920px screen
    const screenW = 1920;
    const halfW = Math.sqrt(3) * radius * hexSize * scale;
    const xMin = screenW - halfW - PAN_PADDING * screenW; // leftmost padded pan
    const result = inertiaStep({ x: xMin, y: 0 }, { x: -1000, y: 0 }, 0.1, radius, hexSize, scale, screenW, 1080, 1);
    expect(result.pan.x).toBe(xMin);
    expect(result.done).toBe(true);
  });
  it('passes tilt through to the clamp', () => {
    const result = inertiaStep({ x: 0, y: -5000 }, { x: 0, y: 0 }, 0.1, 6, 40, 2, 800, 600, 0.7);
    const halfH = 1.5 * 6 * 40 * 2 * 0.7;
    const padY = PAN_PADDING * 600;
    expect(result.pan.y - halfH).toBeLessThanOrEqual(padY);
    expect(result.pan.y + halfH).toBeGreaterThanOrEqual(600 - padY);
  });
});

describe('easeInOutCubic', () => {
  it('is 0 at 0 and 1 at 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
  it('is 0.5 at the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
  it('clamps outside [0,1]', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe('cameraPanStep', () => {
  it('returns start at progress 0 and target at progress 1', () => {
    const start = { x: 100, y: 200 };
    const target = { x: 300, y: 50 };
    expect(cameraPanStep(start, target, 0)).toEqual(start);
    expect(cameraPanStep(start, target, 1)).toEqual(target);
  });
  it('eases between start and target', () => {
    const start = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    expect(cameraPanStep(start, target, 0.5).x).toBeCloseTo(50);
  });
});
