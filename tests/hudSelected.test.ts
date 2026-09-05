import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudSelected } from '../src/ui/hud/HudSelected';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

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

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudSelected village building constraints', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) out.push((ch as Text).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const mount = (level: number, buildingCount: number, owner: number | null, opts: { unitOnVillage?: boolean } = {}): void => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };

    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner, level, captureReady: false, name: 'Alpha' };
    if (opts.unitOnVillage) village.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const buildingTiles = [
      [1, 0],
      [0, 1],
      [1, -1],
      [-1, 0],
    ] as const;
    for (let i = 0; i < buildingCount; i++) {
      const [q, r] = buildingTiles[i]!;
      const t = tileAt(map, q, r)!;
      t.ownedBy = owner;
      t.claimedByVillage = { q: 0, r: 0 };
      t.building = { kind: 'mine', level: 1 };
    }
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'village', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  const helpButtons = (): number => texts().filter((t) => t === '?').length;

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows the building count and an upgrade hint when the village is full', () => {
    mount(2, 2, 0);
    const all = texts().join('\n');
    expect(all).toContain('Buildings: 2/2');
    expect(all).toContain('Full — upgrade to level 3 for more building slots');
  });

  it('shows the building count without a hint when the village has free slots', () => {
    mount(3, 1, 0);
    const all = texts().join('\n');
    expect(all).toContain('Buildings: 1/3');
    expect(all).not.toContain('Full');
  });

  it('shows 1/1 at level 1 when full and hints at upgrading', () => {
    mount(1, 1, 0);
    const all = texts().join('\n');
    expect(all).toContain('Buildings: 1/1');
    expect(all).toContain('upgrade to level 2');
  });

  it('omits building info for a free village', () => {
    mount(2, 1, null);
    expect(texts().join('\n')).not.toContain('Buildings:');
  });

  it('does not show Owner or Village lines for an owned village with a unit', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const all = texts().join('\n');
    expect(all).toContain('Warrior HP');
    expect(all).toContain('Alpha');
    expect(all).not.toContain('Village:');
    expect(all).not.toContain('Owner:');
  });

  it('shows one help button on the Buildings line of an owned village', () => {
    mount(1, 1, 0);
    const all = texts().join('\n');
    expect(all).toContain('Buildings: 1/1');
    // settlement line + Buildings line each carry a help button.
    expect(helpButtons()).toBe(2);
  });

  it('shows only the settlement help button for a free village', () => {
    mount(1, 1, null);
    expect(helpButtons()).toBe(1);
  });

  it('highlights the Buildings line in gold during the upgradeVillage3 step', () => {
    mount(2, 2, 0);
    const st = useGameStore.getState();
    st.setTutorial(true);
    st.setTutorialStep('upgradeVillage3');
    const gold = findText((hud as unknown as { el: Container }).el!, 'Buildings:');
    expect(gold).toBeDefined();
    expect(gold!.style.fill).toBe(0xffd700);
  });

  it('does not highlight the Buildings line during other tutorial steps', () => {
    mount(2, 2, 0);
    const st = useGameStore.getState();
    st.setTutorial(true);
    st.setTutorialStep('buildPort');
    const text = findText((hud as unknown as { el: Container }).el!, 'Buildings:');
    expect(text).toBeDefined();
    expect(text!.style.fill).not.toBe(0xffd700);
  });
});

function findText(root: Container, prefix: string): Text | undefined {
  for (const ch of root.children) {
    if (ch instanceof Text) {
      if ((ch as Text).text.startsWith(prefix)) return ch as Text;
    } else if (ch instanceof Container) {
      const found = findText(ch as Container, prefix);
      if (found) return found;
    }
  }
  return undefined;
}
