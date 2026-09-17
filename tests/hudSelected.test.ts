import { afterEach, describe, expect, it } from 'vitest';
import { Circle, Container, Graphics, Sprite, BitmapText } from 'pixi.js';
import { HudSelected } from '../src/ui/hud/HudSelected';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { type BonusKind } from '../src/game/bonus';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tileTypes';
import { hexNeighbors } from '../src/game/hex';
import type { GameMap, MapTile } from '../src/game/mapGen';

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
    expect(labels).toContain('50/50');
    expect(labels).toContain('20');
    expect(labels).toContain('10');
    expect(labels).toContain('1');
    expect(all).toContain('+3 DEF — village wall');
    expect(all).not.toContain('DEF 0');
    expect(all).not.toContain('UPKEEP');
  });

  it('renders 4 stat icons inline on the selected unit line plus the income icon', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const widths = findSprites((hud as unknown as { el: Container }).el!)
      .map((s) => s.width)
      .filter((w) => w === 16);
    // 4 unit stats + the gold village income icon on the settlement line.
    expect(widths).toEqual([16, 16, 16, 16, 16]);
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

  it('lists only the mine yield (stone and ore) in the produces line', () => {
    boot((map) => {
      const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
      t.ownedBy = 0;
      t.building = { kind: 'mine', level: 1 };
      return t;
    });
    const all = texts().join('\n');
    expect(all).toContain('Produces: stone 1, ore 1');
    expect(all).not.toMatch(/wood 0/);
  });

  it('lists only the sawmill yield (wood) in the produces line', () => {
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
    expect(all).toContain('Produces: wood 1');
    expect(all).not.toMatch(/stone 0/);
    expect(all).not.toMatch(/ore 0/);
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
    expect(texts().join('\n')).toContain('A stash of 15 money');
  });

  it('describes an explorer bonus', () => {
    boot('explorer');
    expect(texts().join('\n')).toContain('An explorer scouts and reveals new lands');
  });

  it('describes a skill bonus', () => {
    boot('skill');
    expect(texts().join('\n')).toContain('Reveals a random skill scroll');
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
    expect(texts().join('\n')).not.toContain('A stash of 15 money');
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
          ch.hitArea instanceof Circle &&
          ch.children.length === 2 &&
          ch.children[0] instanceof Graphics &&
          ch.children[1] instanceof Graphics
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
