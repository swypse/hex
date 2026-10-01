import { afterEach, describe, expect, it } from 'vitest';
import { Circle, Rectangle, Container, Graphics, Sprite, BitmapText } from 'pixi.js';
import { HudSelected } from '../src/ui/hud/hud-selected';
import { useGameStore } from '../src/store/game-store';
import { gameController } from '../src/controller/game-controller';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { type BonusKind } from '../src/game/bonus';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tile-types';
import { UNIT_TYPES } from '../src/game/units';
import { TRAP_TURNS } from '../src/game/traps';
import { hexNeighbors } from '../src/game/hex';
import { t } from '../src/i18n';
import type { GameMap, MapTile } from '../src/game/map-gen';

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
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const mount = (level: number, buildingCount: number, owner: number | null, opts: { unitOnVillage?: boolean; wall?: boolean } = {}): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };

    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner, level, captureReady: false, name: 'Alpha', ...(opts.wall ? { wall: true } : {}) };
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

  const helpButtons = (): number => {
    const el = (hud as unknown as { el: Container }).el!;
    let n = 0;
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Container && ch.hitArea instanceof Circle) {
          const hasSprite = (ch as Container).children.some((x) => x instanceof Sprite);
          if (hasSprite) n++;
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return n;
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows the food balance of an own village and a red starvation line when it starves', () => {
    mount(1, 0, 0);
    expect(texts().some((s) => s.startsWith('Food: farms 0'))).toBe(true);
    expect(texts().some((s) => s.startsWith('Starving!'))).toBe(false);
    const village = tileAt(gameController.getMap()!, 0, 0)!;
    village.settlement!.starving = true;
    useGameStore.setState({ selection: { kind: 'village', q: 0, r: 0 } });
    expect(texts().some((s) => s.startsWith('Starving!'))).toBe(true);
  });

  it('suggests opening Agriculture on an own empty land tile, then Granary next to a farm', () => {
    mount(1, 0, 0);
    const map = gameController.getMap()!;
    const tile = tileAt(map, 1, 0)!;
    tile.ownedBy = 0;
    const human = useGameStore.getState().players[0]!;
    useGameStore.setState({ selection: { kind: 'terrain', q: 1, r: 0 } });
    expect(texts()).toContain('Open Agriculture');
    human.skills.push('agriculture');
    const farm = tileAt(map, 1, -1)!;
    farm.ownedBy = 0;
    farm.building = { kind: 'farm', level: 1 };
    useGameStore.setState({ selection: { kind: 'terrain', q: 1, r: 0 } });
    expect(texts()).not.toContain('Open Agriculture');
    expect(texts()).toContain('Open Granary');
  });

  it('shows the stored food of a selected granary', () => {
    mount(1, 0, 0);
    const map = gameController.getMap()!;
    const granary = tileAt(map, 1, 0)!;
    granary.ownedBy = 0;
    granary.building = { kind: 'granary', level: 1, food: 7 };
    tileAt(map, 1, -1)!.ownedBy = 0;
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    useGameStore.setState({ selection: { kind: 'terrain', q: 1, r: 0 } });
    expect(texts()).toContain('Stored food: 7/50 (collects what adjacent farms do not use)');
  });

  it('lays the drop shadow beneath the info panel background', () => {
    mount(1, 1, 0);
    const el = (hud as unknown as { el: Container }).el!;
    const panels = el.children.filter(
      (c): c is Graphics => c instanceof Graphics && (c as Graphics).context.instructions.some((i) => i.action === 'fill'),
    );
    const fills = (g: Graphics): number[] =>
      g.context.instructions
        .filter((i) => i.action === 'fill')
        .map((i) => (i as { data: { style: { alpha: number } } }).data.style.alpha);
    const shadow = panels.find((g) => fills(g).includes(0.3))!;
    const bg = panels.find((g) => fills(g).includes(1))!;
    expect(shadow).toBeDefined();
    expect(bg).toBeDefined();
    expect(el.children.indexOf(shadow)).toBeLessThan(el.children.indexOf(bg));
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
    expect(all).toContain('Warrior');
    expect(all).toContain('Alpha');
    expect(all).not.toContain('Village:');
    expect(all).not.toContain('Owner:');
  });

  it('shows the unit defense and walled-village buff on the selected unit', () => {
    mount(1, 1, 0, { unitOnVillage: true, wall: true });
    const all = texts().join('\n');
    const labels = texts();
    // The unit hp no longer appears in the selected-cell panel.
    expect(labels.some((x) => x.startsWith('50/50'))).toBe(false);
    expect(labels).toContain('20');
    expect(labels).toContain('10');
    expect(labels).toContain('1');
    expect(all).toContain('+3 DEF — village wall');
    expect(all).not.toContain('DEF 0');
    expect(all).not.toContain('UPKEEP');
  });

  it('does not append a bullet to the unit name', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const labels = texts();
    expect(labels.some((x) => x.includes('•'))).toBe(false);
  });

  it('renders 3 stat icons inline on the selected unit line plus the income icon', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const widths = findSprites((hud as unknown as { el: Container }).el!)
      .map((s) => s.width)
      .filter((w) => w === 16);
    // 3 unit stats (attack/defense/gold, hp removed) + the gold village income
    // and food balance icons on the settlement line, plus the three 16px help
    // buttons (unit / settlement / building limit) and the 16px close icon.
    expect(widths).toEqual([16, 16, 16, 16, 16, 16, 16, 16, 16]);
  });

  it('draws a button-style drop shadow behind the info panel', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const el = (hud as unknown as { el: Container }).el!;
    const shapes = el.children.filter((c) => c instanceof Graphics) as Graphics[];
    const shadow = shapes[0]!;
    const panel = shapes[1]!;
    expect(shadow.position.x).toBe(4);
    expect(shadow.position.y).toBe(4);
    // The shadow card has the same footprint as the panel (before its 4px offset).
    expect(shadow.getLocalBounds().maxX).toBeGreaterThan(0);
    expect(shadow.getLocalBounds().maxX).toBeCloseTo(panel.getLocalBounds().maxX, 0);
    expect(shadow.getLocalBounds().maxY).toBeCloseTo(panel.getLocalBounds().maxY, 0);
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

describe('HudSelected building produce and bridge info lines', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const helpButtons = (): number => {
    const el = (hud as unknown as { el: Container }).el!;
    let n = 0;
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Container && ch.hitArea instanceof Circle) {
          const hasSprite = (ch as Container).children.some((x) => x instanceof Sprite);
          if (hasSprite) n++;
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return n;
  };

  /** The green 8x8 hp squares drawn on the building row (x positions). */
  const hpSquares = (): { w: number; h: number; x: number }[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: { w: number; h: number; x: number }[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Graphics) {
          for (const ins of ch.context.instructions) {
            const data = ins.data as { style?: { color?: number }; path?: { shapePath: { shapePrimitives: { shape: { x: number; y: number; width: number; height: number } }[] } } };
            if (ins.action !== 'fill' || data.style?.color !== 0x49cc5d) continue;
            for (const prim of data.path!.shapePath.shapePrimitives) out.push({ w: prim.shape.width, h: prim.shape.height, x: prim.shape.x });
          }
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (setup: (map: GameMap) => MapTile): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = setup(map);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'village', q: tile.q, r: tile.r },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('lists only the mine yield (stone and ore) on the building row', () => {
    boot((map) => {
      const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
      t.ownedBy = 0;
      t.building = { kind: 'mine', level: 1 };
      return t;
    });
    const all = texts().join('\n');
    expect(texts().filter((x) => x === '1')).toHaveLength(2); // plain N, no plus sign
    expect(all).not.toMatch(/wood/);
  });

  it('shows the full hp next to a pristine building', () => {
    boot((map) => {
      const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
      t.ownedBy = 0;
      t.building = { kind: 'mine', level: 1 };
      return t;
    });
    const squares = hpSquares();
    expect(squares).toHaveLength(2);
    expect(squares.every((q) => q.w === 8 && q.h === 8)).toBe(true);
    expect(squares[1]!.x - squares[0]!.x).toBe(11); // 8px square + 3px gap
    expect(texts().join('\n')).not.toContain('2/2');
  });

  it('shows the reduced hp next to a damaged building', () => {
    boot((map) => {
      const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
      t.ownedBy = 0;
      t.building = { kind: 'mine', level: 1, hp: 1 };
      return t;
    });
    expect(hpSquares()).toHaveLength(1);
  });

  it('lists only the sawmill yield (wood) on the building row', () => {
    boot((map) => {
      const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
      const neighbor = map.tiles.find((n) =>
        hexNeighbors(t).some((h) => h.q === n.q && h.r === n.r),
      )!;
      neighbor.terrain = TileType.GrasslandForest;
      t.ownedBy = 0;
      t.building = { kind: 'sawmill', level: 1 };
      return t;
    });
    const all = texts().join('\n');
    expect(texts().filter((x) => x === '1')).toHaveLength(1);
    expect(all).not.toMatch(/stone \d/);
    expect(all).not.toMatch(/ore \d/);
  });

  it('shows a Bridge row with a help button on a bridged tile', () => {
    boot((map) => {
      const t = tileAt(map, 0, 0)!;
      t.terrain = TileType.Water;
      t.bridge = { owner: 0, dir: 'we' };
      t.roadOwner = 0;
      return t;
    });
    const all = texts().join('\n');
    expect(all).toContain('Water');
    expect(all).toContain('Bridge');
    expect(helpButtons()).toBeGreaterThanOrEqual(1);
  });
});

describe('HudSelected connected village income bonus', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (setupConnected: boolean): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false, name: 'Alpha' };
    if (setupConnected) {
      const other = tileAt(map, 1, 0)!;
      other.settlement = { owner: 0, level: 1, captureReady: false, name: 'Beta' };
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

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows income as a gold icon + number on the village line when connected', () => {
    boot(true);
    const all = texts().join('\n');
    // The income now lives on the village line as an icon + value pair.
    expect(all).not.toContain('Income:');
    expect(texts()).toContain('6');
    expect(all).toContain('Connected: +1 income');
    const width16 = findSprites((hud as unknown as { el: Container }).el!)
      .map((s) => s.width)
      .filter((w) => w === 16);
    expect(width16).not.toHaveLength(0);
  });

  it('omits the bonus line and shows base income on the village line when not connected', () => {
    boot(false);
    const all = texts().join('\n');
    expect(all).not.toContain('Income:');
    expect(texts()).toContain('5');
    expect(all).not.toContain('Connected');
  });
});

describe('HudSelected pirate deal info', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (paidBy: number[] | null): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.terrain = TileType.Water;
    tile.unit = {
      id: 'p1', owner: -1, type: 'pirate', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 80, attack: 30, attackDistance: 3, defense: 5, spawnVillage: null,
      ...(paidBy ? { paidBy } : {}),
    };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'unit', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows a deal line on a pirate without an active deal', () => {
    boot(null);
    const all = texts().join('\n');
    expect(all).toContain('Pirate: no deal');
  });

  it('names the friend tribe on the active-deal line', () => {
    boot([0]);
    const all = texts().join('\n');
    expect(all).toContain('Pirate: deal active');
    expect(all).toContain('Villagers');
  });

  it('lists every friend tribe of the pirate', () => {
    boot([0, 1]);
    const all = texts().join('\n');
    expect(all).toContain('Villagers');
    expect(all).toContain('Cats');
    expect(all).not.toContain('Pirate: no deal');
  });
});

describe('HudSelected berserker rage attack info', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (hp: number): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.unit = makeUnit('b1', 0, 'berserker', 0, 0);
    tile.unit.hp = hp;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'unit', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('appends the +10 rage bonus to the attack value while rage is active', () => {
    boot(10); // 10 <= 35% of 50 → raging
    const all = texts().join('\n');
    expect(all).toMatch(/\+10/);
    // No hp readout in the panel anymore.
    expect(all).not.toMatch(/\/50/);
  });

  it('shows a plain attack value when not raging', () => {
    boot(40); // above the 35% rage threshold
    const all = texts().join('\n');
    expect(all).not.toMatch(/\+10/);
  });
});

describe('HudSelected stealth info', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (stealthed: boolean): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.terrain = TileType.GrasslandLand;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'st', owner: 0, type: 'stalker', q: 0, r: 0,
      hasMoved: true, hasAttacked: true, hasHealed: true,
      hp: UNIT_TYPES.stalker.maxHp, attack: 10, attackDistance: 1, spawnVillage: null,
      ...(stealthed ? { isStealthed: true } : {}),
    };
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'unit', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows a stealth tag on the owner stealthed stalker', () => {
    boot(true);
    const all = texts().join('\n');
    expect(all).toContain('stealth');
  });

  it('omits the stealth tag when the stalker is not stealthed', () => {
    boot(false);
    const all = texts().join('\n');
    expect(all).not.toContain('stealth');
  });
});

describe('HudSelected trap info', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (trapOwner: number | null, turn: number): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.ownedBy = 0;
    if (trapOwner !== null) tile.trap = { owner: trapOwner, placedTurn: 2 };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      turn,
      selection: { kind: 'terrain', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    useGameStore.setState({ turn: 1 });
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('shows the trap for its owner with the turns left on the map', () => {
    boot(0, 2);
    expect(texts().join('\n')).toContain(`Thorn trap: ${TRAP_TURNS} turns left`);
  });

  it('counts down as the game advances beyond the placement turn', () => {
    boot(0, 4);
    expect(texts().join('\n')).toContain(`Thorn trap: ${TRAP_TURNS - 2} turns left`);
  });

  it('never shows a negative count once a trap has expired', () => {
    boot(0, 2 + TRAP_TURNS + 5);
    expect(texts().join('\n')).toContain('Thorn trap: 0 turns left');
  });

  it('does not reveal a foreign trap to the selected owner', () => {
    boot(1, 2);
    expect(texts().join('\n')).not.toContain('Thorn trap');
  });

  it('shows no trap line on a tile without a trap', () => {
    boot(null, 2);
    expect(texts().join('\n')).not.toContain('Thorn trap');
  });
});

describe('HudSelected bonus info', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const boot = (kind: BonusKind): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.bonus = { kind, claimer: null, arrivalTurn: 0 };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'terrain', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('describes a money bonus', () => {
    boot('money');
    expect(texts().join('\n')).toContain(t('hud.selected.bonus.info'));
  });

  it('describes an explorer bonus', () => {
    boot('explorer');
    expect(texts().join('\n')).toContain(t('hud.selected.bonus.info'));
  });

  it('describes a skill bonus', () => {
    boot('skill');
    expect(texts().join('\n')).toContain(t('hud.selected.bonus.info'));
  });

  it('does not describe a bonus on a plain tile', () => {
    boot('money');
    const map = makeTestMap(2);
    tileAt(map, 0, 0)!.bonus = null;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'terrain', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(texts().join('\n')).not.toContain(t('hud.selected.bonus.info'));
  });
});

describe('HudSelected turn visibility', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const boot = (currentPlayerIndex: number): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      currentPlayerIndex,
      selection: { kind: 'unit', q: 0, r: 0 },
      netMode: 'single',
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    useGameStore.setState({ currentPlayerIndex: 0 });
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const visible = (): boolean => ((hud as unknown as { el: Container }).el!.visible);

  it('shows the selected info panel during the local player turn', () => {
    boot(0);
    expect(visible()).toBe(true);
  });

  it('hides the selected info panel while another player is acting', () => {
    boot(1);
    expect(visible()).toBe(false);
  });
});

describe('HudSelected close button and collapsed state', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const closeButton = (): Container | undefined => {
    const el = (hud as unknown as { el: Container }).el!;
    const walk = (c: Container): Container | undefined => {
      for (const ch of c.children) {
        if (
          ch instanceof Container &&
          ch.hitArea instanceof Rectangle &&
          ch.children.length === 1 &&
          ch.children[0] instanceof Sprite
        ) {
          return ch as Container;
        }
        if (ch instanceof Container) {
          const found = walk(ch as Container);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk(el);
  };

  const collapsedIcon = (): Container | undefined => {
    const el = (hud as unknown as { el: Container }).el!;
    const walk = (c: Container): Container | undefined => {
      for (const ch of c.children) {
        if (ch instanceof Container && ch.hitArea instanceof Circle && ch.children.length === 1 && ch.children[0] instanceof Sprite) {
          return ch as Container;
        }
        if (ch instanceof Container) {
          const found = walk(ch as Container);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk(el);
  };

  const boot = (): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'unit', q: 0, r: 0 },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('draws a close button in the open popup', () => {
    boot();
    expect(texts().join('\n')).toContain('Warrior');
    expect(closeButton()).toBeDefined();
  });

  it('collapses to the action-info icon when closed', () => {
    boot();
    (closeButton()! as unknown as { emit: (e: string) => void }).emit('pointertap');
    expect(texts()).toHaveLength(0);
    const icon = collapsedIcon();
    expect(icon).toBeDefined();
    const sprites = findSprites((hud as unknown as { el: Container }).el!);
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.width).toBe(32);
  });

  it('re-opens the full popup when the collapsed icon is tapped', () => {
    boot();
    (closeButton()! as unknown as { emit: (e: string) => void }).emit('pointertap');
    (collapsedIcon()! as unknown as { emit: (e: string) => void }).emit('pointertap');
    expect(texts().join('\n')).toContain('Warrior');
    expect(closeButton()).toBeDefined();
  });
});

function findText(root: Container, prefix: string): BitmapText | undefined {
  for (const ch of root.children) {
    if (ch instanceof BitmapText) {
      if ((ch as BitmapText).text.startsWith(prefix)) return ch as BitmapText;
    } else if (ch instanceof Container) {
      const found = findText(ch as Container, prefix);
      if (found) return found;
    }
  }
  return undefined;
}

function findSprites(root: Container): Sprite[] {
  const out: Sprite[] = [];
  const walk = (c: Container): void => {
    for (const ch of c.children) {
      if (ch instanceof Sprite) out.push(ch as Sprite);
      if (ch instanceof Container) walk(ch as Container);
    }
  };
  walk(root);
  return out;
}

describe('HudSelected building destroy and tile extras', () => {
  let hud: HudSelected;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const texts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) out.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  const mount = (q: number, r: number, opts: { ownedBy?: number | null; bottle?: boolean; village?: boolean } = {}): void => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = makeTestMap(2);
    const tile = tileAt(map, q, r)!;
    tile.ownedBy = opts.ownedBy ?? null;
    if (opts.village) {
      tile.settlement = { owner: opts.ownedBy ?? null, level: 1, captureReady: false, name: 'Alpha' };
    } else {
      tile.building = { kind: 'mine', level: 1 };
    }
    if (opts.bottle) tile.bottle = { bornTurn: 1, arrivalTurn: 1 };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'village', q, r },
      tutorial: false,
      tutorialStep: null,
    });
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
  };

  afterEach(() => {
    hud?.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  it('offers destroy for an own building but not a foreign one', () => {
    mount(1, 0, { ownedBy: 0 });
    expect(texts()).toContain('Destroy building (5m)');
    hud.destroy();
    mount(1, 0, { ownedBy: 1 });
    expect(texts()).not.toContain('Destroy building (5m)');
  });

  it('shows a bottle line when a bottle floats on the selected tile', () => {
    mount(1, 0, { ownedBy: 0, bottle: true });
    expect(texts()).toContain('A message in a bottle floats here');
  });

  it('shows the next-level upgrade cost for an own village', () => {
    mount(0, 0, { ownedBy: 0, village: true });
    expect(texts().some((s) => s.startsWith('Upgrade to level 2:'))).toBe(true);
  });
});
