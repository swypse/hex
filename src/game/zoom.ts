export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export const INERTIA_DECAY = 0.01;
export const INERTIA_START_SPEED = 100;
export const INERTIA_STOP_SPEED = 30;

export const PAN_PADDING = 0.5; // fraction of the screen, on each side

export const QUALITY_CAP = 4;

export function maxZoomFor(aspectRatio: number): number {
  return MAX_ZOOM + Math.min(2, Math.max(0, (aspectRatio - 1) * 2));
}

export function clampZoom(zoom: number, maxZoom = MAX_ZOOM): number {
  return Math.min(maxZoom, Math.max(MIN_ZOOM, zoom));
}

export function fitScaleFor(
  screenW: number,
  screenH: number,
  mapW: number,
  mapH: number,
): number {
  const fitW = (screenW / mapW) * 0.9;
  const fitH = (screenH / mapH) * 0.9;
  const aspect = screenH / screenW;
  const t = Math.min(1, Math.max(0, (aspect - 1) / 1.5));
  return fitW + (fitH - fitW) * t;
}

export function zoomAroundCursor(
  cursor: { x: number; y: number },
  containerPos: { x: number; y: number },
  scale: number,
  nextScale: number,
): { x: number; y: number } {
  const worldX = (cursor.x - containerPos.x) / scale;
  const worldY = (cursor.y - containerPos.y) / scale;
  return {
    x: cursor.x - worldX * nextScale,
    y: cursor.y - worldY * nextScale,
  };
}

export function clampPan(
  pos: { x: number; y: number },
  mapRadius: number,
  hexSize: number,
  scale: number,
  screenW: number,
  screenH: number,
  tilt: number,
): { x: number; y: number } {
  const halfW = Math.sqrt(3) * mapRadius * hexSize * scale;
  const halfH = 1.5 * mapRadius * hexSize * scale * tilt;
  // Allow the map edge to sit up to PAN_PADDING * screen inside the viewport.
  // Map spans [pan.x-halfW, pan.x+halfW]; pan.x in [screenW-halfW-padX, halfW+padX].
  // When the map fits within the screen, keep it centered instead.
  const padX = PAN_PADDING * screenW;
  const padY = PAN_PADDING * screenH;
  // When the map fits within the screen, let it pan freely while staying fully
  // visible; otherwise keep the edges within padding distance of the viewport.
  const xMin = 2 * halfW <= screenW ? halfW : screenW - halfW - padX;
  const xMax = 2 * halfW <= screenW ? screenW - halfW : halfW + padX;
  const yMin = 2 * halfH <= screenH ? halfH : screenH - halfH - padY;
  const yMax = 2 * halfH <= screenH ? screenH - halfH : halfH + padY;
  const clampAxis = (v: number, lo: number, hi: number): number =>
    lo < hi ? Math.min(hi, Math.max(lo, v)) : (lo + hi) / 2;
  return {
    x: clampAxis(pos.x, xMin, xMax),
    y: clampAxis(pos.y, yMin, yMax),
  };
}

export function qualityFactor(baseScale: number, devicePixelRatio: number, maxZoom = MAX_ZOOM): number {
  return Math.min(QUALITY_CAP, baseScale * maxZoom * devicePixelRatio);
}

export function decayVelocity(
  velocity: { x: number; y: number },
  dt: number,
): { x: number; y: number } {
  const factor = Math.pow(INERTIA_DECAY, dt);
  return { x: velocity.x * factor, y: velocity.y * factor };
}

export function inertiaStep(
  pan: { x: number; y: number },
  velocity: { x: number; y: number },
  dt: number,
  mapRadius: number,
  hexSize: number,
  scale: number,
  screenW: number,
  screenH: number,
  tilt: number,
): { pan: { x: number; y: number }; velocity: { x: number; y: number }; done: boolean } {
  const next = clampPan(
    { x: pan.x + velocity.x * dt, y: pan.y + velocity.y * dt },
    mapRadius,
    hexSize,
    scale,
    screenW,
    screenH,
    tilt,
  );
  const nextVelocity = decayVelocity(velocity, dt);
  const speed = Math.hypot(nextVelocity.x, nextVelocity.y);
  const pinned = next.x === pan.x && next.y === pan.y && (velocity.x !== 0 || velocity.y !== 0);
  return {
    pan: next,
    velocity: nextVelocity,
    done: speed < INERTIA_STOP_SPEED || pinned,
  };
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function cameraPanStep(
  pan: { x: number; y: number },
  target: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const e = easeInOutCubic(progress);
  return { x: pan.x + (target.x - pan.x) * e, y: pan.y + (target.y - pan.y) * e };
}
