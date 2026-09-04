import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { SkillTree } from '../src/ui/overlays/SkillTree';
import { useGameStore } from '../src/store/gameStore';
import { TRIBES } from '../src/game/tribes';
import { START_RESOURCES } from '../src/game/resources';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
    }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('SkillTree zoom and pan', () => {
  let host: UIHost;
  let root: Container;
  let tree: SkillTree;
  let winListeners: Record<string, Array<(e: unknown) => void>>;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    winListeners = {};
    const win = (globalThis as { window: { addEventListener: (t: string, cb: (e: unknown) => void) => void; removeEventListener: (t: string, cb: (e: unknown) => void) => void } }).window;
    win.addEventListener = (t, cb) => { (winListeners[t] ??= []).push(cb); };
    win.removeEventListener = (t, cb) => { winListeners[t] = (winListeners[t] ?? []).filter((f) => f !== cb); };
    useGameStore.setState({
      screen: 'game',
      localPlayerIndex: 0,
      players: [{
        index: 0, tribe: TRIBES[0]!.id, isHuman: true, name: 'p',
        resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true,
      }],
    });
    host = makeHost();
    root = new Container();
    tree = new SkillTree();
    tree.mount(host, root);
  });

  afterEach(() => {
    tree.destroy();
  });

  it('zooms in around the cursor on wheel up', () => {
    const ring = (tree as unknown as { ring: Container }).ring!;
    const before = ring.scale.x;
    const wheel = winListeners['wheel']![0]!;
    wheel({ deltaY: -100, clientX: 400, clientY: 300, preventDefault: () => {} } as never);
    expect(ring.scale.x).toBeGreaterThan(before);
  });

  it('pans the ring when dragged', () => {
    const ring = (tree as unknown as { ring: Container }).ring!;
    const before = { x: ring.position.x, y: ring.position.y };
    const down = winListeners['pointerdown']![0]!;
    down({ pointerId: 7, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 } as never);
    const move = winListeners['pointermove']![0]!;
    move({ pointerId: 7, clientX: 160, clientY: 130 });
    expect(ring.position.x).toBeCloseTo(before.x + 60, 5);
    expect(ring.position.y).toBeCloseTo(before.y + 30, 5);
    const up = winListeners['pointerup']![0]!;
    up({ pointerId: 7, clientX: 160, clientY: 130 });
  });
});
