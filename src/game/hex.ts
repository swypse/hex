export interface Axial {
  q: number;
  r: number;
}

export const HEX_TILT = 0.7; // projected Y squash — hexes wider than tall

export function axialKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

const NEIGHBOR_DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(h: Axial): Axial[] {
  return NEIGHBOR_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  return (
    (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
  );
}

export function ringOf(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [];
  let q = center.q + NEIGHBOR_DIRECTIONS[4]!.q * radius;
  let r = center.r + NEIGHBOR_DIRECTIONS[4]!.r * radius;
  for (let i = 0; i < 6; i++) {
    const dir = NEIGHBOR_DIRECTIONS[i]!;
    for (let j = 0; j < radius; j++) {
      result.push({ q, r });
      q += dir.q;
      r += dir.r;
    }
  }
  return result;
}

export function tilesInRange(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      result.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return result;
}

export function allTiles(mapRadius: number): Axial[] {
  return tilesInRange({ q: 0, r: 0 }, mapRadius);
}

export function hexToPixel(h: Axial, hexSize: number): { x: number; y: number } {
  const x = hexSize * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r);
  const y = hexSize * ((3 / 2) * h.r) * HEX_TILT;
  return { x, y };
}

export function pixelToHex(x: number, y: number, hexSize: number): Axial {
  const r = (2 / 3) * (y / hexSize / HEX_TILT);
  const q = (x / hexSize - (Math.sqrt(3) / 2) * r) / Math.sqrt(3);
  const s = -q - r;
  let qr = Math.round(q);
  let rr = Math.round(r);
  const sr = Math.round(s);
  const dq = Math.abs(qr - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(sr - s);
  if (dq > dr && dq > ds) {
    qr = -rr - sr;
  } else if (dr > ds) {
    rr = -qr - sr;
  }
  return { q: qr, r: rr };
}

export function pointInPolygon(
  x: number,
  y: number,
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface EdgeSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function hexCorner(h: Axial, corner: number, hexSize: number): { x: number; y: number } {
  const angle = (Math.PI / 3) * corner - Math.PI / 6;
  const p = hexToPixel(h, hexSize);
  return { x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) * HEX_TILT };
}

export function hexEdge(h: Axial, edge: number, hexSize: number): EdgeSegment {
  const a = hexCorner(h, edge, hexSize);
  const b = hexCorner(h, (edge + 1) % 6, hexSize);
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

export function hexEdgeNeighbor(h: Axial, edge: number): Axial {
  const dir = NEIGHBOR_DIRECTIONS[(6 - edge) % 6]!;
  return { q: h.q + dir.q, r: h.r + dir.r };
}

export function hexCorners(h: Axial, hexSize: number): { x: number; y: number }[] {
  const p = hexToPixel(h, hexSize);
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    corners.push({ x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) * HEX_TILT });
  }
  return corners;
}

export function splitHexBorder(
  corners: { x: number; y: number }[],
): { top: { x: number; y: number }[]; bottom: { x: number; y: number }[] } {
  const blend = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const rightMid = blend(corners[0]!, corners[1]!, 0.1);
  const leftMid = blend(corners[3]!, corners[4]!, 0.9);
  return {
    top: [rightMid, corners[0]!, corners[5]!, corners[4]!, leftMid],
    bottom: [rightMid, corners[1]!, corners[2]!, corners[3]!, leftMid],
  };
}

export function compareTileY(
  a: { q: number; r: number },
  b: { q: number; r: number },
  hexSize: number,
): number {
  return hexToPixel(a, hexSize).y - hexToPixel(b, hexSize).y;
}
