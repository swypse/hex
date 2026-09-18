/** Screen edges a capture-adjacent village can sit off-screen at. */
export type CaptureMarkerSide = 'l' | 'r' | 't' | 'b';

/** Side length of the capture triangle in screen px. */
export const CAPTURE_EDGE_MARKER_SIZE = 20;
/** Distance (px) the capture triangle slides outward past the screen edge. */
export const CAPTURE_EDGE_MARKER_SLIDE = 10;
export const CAPTURE_EDGE_PULSE_MS = 600;
export const CAPTURE_EDGE_MARKER_ALPHA = 1;

/** The 6 polygon points of the off-screen capture marker triangle.
 *
 *  A red triangle of `size` px whose sharp vertex sits on the given screen
 *  edge pointing at the capturing village (off-screen beyond that edge). Its
 *  body extends `size` px INTO the screen so it is always visible. `slide` is
 *  the distance the marker has moved outward past the edge (0 = resting with
 *  the vertex on the edge, `CAPTURE_EDGE_MARKER_SLIDE` = fully extended with
 *  the vertex poking out that far).
 *
 *  - top edge (village above): vertex on the top edge aims up
 *  - bottom edge (village below): vertex on the bottom edge aims down
 *  - left edge (village left): vertex on the left edge aims left
 *  - right edge (village right): vertex on the right edge aims right
 */
export function captureMarkerPoints(
  side: CaptureMarkerSide,
  along: number,
  slide: number,
  W: number,
  H: number,
  size = CAPTURE_EDGE_MARKER_SIZE,
): [number, number, number, number, number, number] {
  const half = size / 2;
  const z = (v: number): number => (v === 0 ? 0 : v);
  switch (side) {
    case 't': {
      const vertexY = z(-slide);
      const baseY = size - slide;
      return [along - half, baseY, along, vertexY, along + half, baseY];
    }
    case 'b': {
      const vertexY = H + slide;
      const baseY = H - size + slide;
      return [along - half, baseY, along, vertexY, along + half, baseY];
    }
    case 'l': {
      const vertexX = z(-slide);
      const baseX = size - slide;
      return [baseX, along - half, vertexX, along, baseX, along + half];
    }
    case 'r': {
      const vertexX = W + slide;
      const baseX = W - size + slide;
      return [baseX, along - half, vertexX, along, baseX, along + half];
    }
  }
}