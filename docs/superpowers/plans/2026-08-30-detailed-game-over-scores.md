# Detailed Game-Over Score Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple game-over list with a screen showing circular tribe icons (current player first, selected by default, each with a colored place badge) and a details area with a per-player itemized score breakdown.

**Architecture:** Add a `Player.stats` counter object updated in the simulator at kill/capture/upgrade sites; derive the full itemized breakdown from those counters plus the final map in a pure `scoreBreakdown()`; rank players with `rankPlayers()` (computeWinner tiebreakers); rework `GameOver.ts` to render the tribe-icon row + selectable details.

**Tech Stack:** TypeScript, PixiJS, React/Zustand, Vite, Vitest.

## Global Constraints

- `Player.stats?: PlayerStats` is optional (builders seed zeros; the simulator ensures it before mutating). Non-pirate kills = `player.kills - stats.pirateKills` (the existing `kills` counter includes pirates). Skills opened = `player.skills.length`.
- Board/temple/explored items come from the final map; only `killedUnits`, `pirateKills`, `villagesCaptured`, `villageUpgrades` are tracked in-game.
- Itemized scores must sum exactly to `totalScore(map, player)`.
- Place badge colors: gold `0xffd700` (1), silver `0xc0c0c0` (2), bronze `0xcd7f32` (3), gray `0x888888` (4+).
- Tribe icon order: current player first, then others by place.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: `PlayerStats` + `Player.stats` + builders seeding

**Files:**
- Modify: `src/game/score.ts`
- Modify: `src/game/players.ts`
- Modify: `tests/players.test.ts`

**Interfaces:**
- Produces:
  - `PlayerStats` interface and `EMPTY_STATS` constant in `./score`.
  - `Player.stats?: PlayerStats`.
  - `buildPlayers`/`buildMultiplayerPlayers` seed `stats: { ...EMPTY_STATS }`.
  Later tasks consume these.

- [ ] **Step 1: Write the failing test**

Append to `tests/players.test.ts` (inside `describe('buildPlayers')`):

```ts
  it('seeds every player with zeroed stats', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    for (const p of players) {
      expect(p.stats).toEqual({ killedUnits: 0, pirateKills: 0, villagesCaptured: 0, villageUpgrades: 0 });
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- players.test.ts`
Expected: FAIL (`p.stats` is undefined).

- [ ] **Step 3: Write minimal implementation**

`src/game/score.ts` — add at the end:

```ts
export interface PlayerStats {
  killedUnits: number;
  pirateKills: number;
  villagesCaptured: number;
  villageUpgrades: number;
}

export const EMPTY_STATS: PlayerStats = { killedUnits: 0, pirateKills: 0, villagesCaptured: 0, villageUpgrades: 0 };
```

`src/game/players.ts` — add the import and the optional field:

```ts
import { EMPTY_STATS, type PlayerStats } from './score';
```

```ts
export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
  score: number;
  kills: number;
  skills: SkillId[];
  isActive: boolean;
  knownTribes?: Tribe[];
  stats?: PlayerStats;
}
```

In `buildPlayers`, add `stats: { ...EMPTY_STATS },` to the human literal and the AI loop. In `buildMultiplayerPlayers`, add it to the humans `map` and the AI loop.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- players.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/score.ts src/game/players.ts tests/players.test.ts
git commit -m "feat: player score stats tracking"
```

---

### Task 2: Simulator stats updates

**Files:**
- Modify: `src/game/simulator.ts`
- Modify: `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `EMPTY_STATS`, `PlayerStats` from Task 1.
- Produces: `Player.stats` counters populated at the kill/capture/upgrade sites. Later tasks read these.

- [ ] **Step 1: Write the failing test**

Append to `tests/simulator.test.ts` (uses the existing `makeTestMap`, `tileAt`, `makeUnit`, `buildPlayers` helpers; add any missing imports — `PIRATE_OWNER`):

```ts
import { PIRATE_OWNER } from '../src/game/units';
```

```ts
  it('tracks kills, lost units, captures, and upgrades in player stats', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    tileAt(map, 0, 0)!.unit = makeUnit('me', 0, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.unit = makeUnit('enemy', 1, 'warrior', 1, 0);
    tileAt(map, 1, 0)!.unit!.hp = 2;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'attack', unitId: 'me', q: 1, r: 0 });
    expect(players[1].stats!.killedUnits).toBe(1);
    expect(players[0].kills).toBe(1);
    expect(players[0].stats!.pirateKills).toBe(0);
  });
```

Note: the starting unit id is `w0` (map generation assigns `w${n}` to capital warriors). Verify the actual id in the generated map or use `map.tiles.find((t) => t.unit?.owner === 0)!.unit!.id` instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- simulator.test.ts`
Expected: FAIL (`players[1].stats` is undefined or `killedUnits` not incremented).

- [ ] **Step 3: Write minimal implementation**

`src/game/simulator.ts` — add the import and a private helper:

```ts
import { awardScore, awardTempleScores, CAPTURE_SCORE, EMPTY_STATS, KILL_SCORE, PIRATE_KILL_SCORE, SKILL_SCORE, UPGRADE_SCORE } from './score';
```

```ts
  private statsOf(player: Player): PlayerStats {
    player.stats ??= { ...EMPTY_STATS };
    return player.stats;
  }
```

(Add `PlayerStats` to the existing `import { Player } from './players';` — it already imports `Player`.)

In `doAttack`, extend the kill blocks:

```ts
    if (result.targetDied) {
      attackerPlayer.kills += 1;
      const pts = targetWasPirate ? PIRATE_KILL_SCORE : KILL_SCORE;
      awardScore(attackerPlayer, pts);
      this.emitScoreFly(attackerPlayer.index, pts, target);
      if (targetWasPirate) {
        this.statsOf(attackerPlayer).pirateKills += 1;
      } else if (targetPlayer) {
        this.statsOf(targetPlayer).killedUnits += 1;
      }
    }
    if (result.attackerDied && targetPlayer) {
      targetPlayer.kills += 1;
      awardScore(targetPlayer, KILL_SCORE);
      this.statsOf(attackerPlayer).killedUnits += 1;
      const attackerTile = tileAt(this.map, attacker.q, attacker.r);
      if (attackerTile) this.emitScoreFly(targetPlayer.index, KILL_SCORE, attackerTile);
    }
```

In `doCapture`, after `awardScore(capturer, CAPTURE_SCORE);`:

```ts
    this.statsOf(capturer).villagesCaptured += 1;
```

In `doUpgradeVillage`, after `awardScore(player, UPGRADE_SCORE);`:

```ts
    this.statsOf(player).villageUpgrades += 1;
```

In `pirateAttack`, add target-death tracking and pirate-kill tracking:

```ts
    if (result.targetDied && targetOwner >= 0) {
      const victim = this.players[targetOwner];
      if (victim) this.statsOf(victim).killedUnits += 1;
    }
    if (result.attackerDied && targetOwner >= 0) {
      const owner = this.players[targetOwner];
      if (owner) {
        owner.kills += 1;
        this.statsOf(owner).pirateKills += 1;
        awardScore(owner, PIRATE_KILL_SCORE);
        const tile = tileAt(this.map, attackerTilePos.q, attackerTilePos.r);
        if (tile) this.emitScoreFly(owner.index, PIRATE_KILL_SCORE, tile);
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- simulator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/simulator.ts tests/simulator.test.ts
git commit -m "feat: track player stats in the simulator"
```

---

### Task 3: `scoreBreakdown` function

**Files:**
- Modify: `src/game/score.ts`
- Modify: `tests/score.test.ts`

**Interfaces:**
- Consumes: `Player.stats` from Task 1.
- Produces:
  - `interface ScoreBreakdownItem { label: string; count: number; score: number }`
  - `scoreBreakdown(map: GameMap, player: Player, fastBonus: number): ScoreBreakdownItem[]`
  (fast bonus value is computed by the caller — avoids a score→gameMode import cycle.)
  Task 5 consumes this.

- [ ] **Step 1: Write the failing test**

Append to `tests/score.test.ts`:

```ts
describe('scoreBreakdown', () => {
  it('itemizes action scores and board scores, summing to totalScore', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }, unit('warrior', 0)),
      tile(1, 0, 0, null, null, { kind: 'factory', level: 1 }),
      tile(2, 0, 0, null, null, { kind: 'temple', level: 2 }),
      tile(3, 0, 0, null, null, { kind: 'forestTemple', level: 3 }),
    );
    const p: Player = {
      index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
      resources: { wood: 0, stone: 0, money: 0, ore: 0 },
      score: 25 + 30 + 50 + 20 + 15 + 15 + 20 + 40,
      kills: 2, skills: ['swordsman'], isActive: true,
      stats: { killedUnits: 3, pirateKills: 1, villagesCaptured: 1, villageUpgrades: 1 },
    };
    const items = scoreBreakdown(map, p, 40);
    const byLabel = new Map(items.map((i) => [i.label, i]));
    expect(byLabel.get('Killed units')!.count).toBe(3);
    expect(byLabel.get('Kills')!.count).toBe(1);
    expect(byLabel.get('Kills')!.score).toBe(KILL_SCORE);
    expect(byLabel.get('Pirate kills')!.count).toBe(1);
    expect(byLabel.get('Pirate kills')!.score).toBe(PIRATE_KILL_SCORE);
    expect(byLabel.get('Buildings')!.count).toBe(1);
    expect(byLabel.get('Buildings')!.score).toBe(BUILDING_SCORE);
    expect(byLabel.get('WaterTemples')!.score).toBe(15);
    expect(byLabel.get('ForestTemples')!.score).toBe(20);
    expect(byLabel.get('Captured villages')!.count).toBe(1);
    expect(byLabel.get('Captured villages')!.score).toBe(CAPTURE_SCORE);
    expect(byLabel.get('Village upgrades')!.count).toBe(1);
    expect(byLabel.get('Village upgrades')!.score).toBe(UPGRADE_SCORE);
    expect(byLabel.get('Skills opened')!.count).toBe(1);
    expect(byLabel.get('Skills opened')!.score).toBe(SKILL_SCORE);
    expect(byLabel.get('Fast capture-mode bonus')!.score).toBe(40);
    const sum = items.reduce((acc, i) => acc + i.score, 0);
    expect(sum).toBe(totalScore(map, p));
  });
});
```

(The `tile`, `unit`, `player` helpers and all constants are already imported in this file. Add `scoreBreakdown` and `Player` to imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- score.test.ts`
Expected: FAIL (`scoreBreakdown` not defined).

- [ ] **Step 3: Write minimal implementation**

`src/game/score.ts` — add the interface and function:

```ts
export interface ScoreBreakdownItem {
  label: string;
  count: number;
  score: number;
}

export function scoreBreakdown(map: GameMap, player: Player, fastBonus: number): ScoreBreakdownItem[] {
  const stats = player.stats ?? EMPTY_STATS;
  const pirateKills = stats.pirateKills;
  const kills = Math.max(0, player.kills - pirateKills);
  const skillsOpened = player.skills.length;
  const explored = map.tiles.filter((t) => isExploredFor(t, player.index)).length;
  let villages = 0;
  let units = 0;
  let unitScore = 0;
  let buildings = 0;
  let buildingScore = 0;
  let waterTemples = 0;
  let waterTempleScore = 0;
  let forestTemples = 0;
  let forestTempleScore = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index) continue;
    if (t.settlement) villages += 1;
    if (t.unit) {
      units += 1;
      unitScore += UNIT_SCORE[t.unit.type] ?? 0;
    }
    if (!t.building) continue;
    if (t.building.kind === 'temple') {
      waterTemples += 1;
      waterTempleScore += TEMPLE_SCORES[t.building.level] ?? 0;
    } else if (t.building.kind === 'forestTemple') {
      forestTemples += 1;
      forestTempleScore += TEMPLE_SCORES[t.building.level] ?? 0;
    } else {
      buildings += 1;
      buildingScore += BUILDING_SCORE;
    }
  }
  return [
    { label: 'Killed units', count: stats.killedUnits, score: 0 },
    { label: 'Kills', count: kills, score: kills * KILL_SCORE },
    { label: 'Pirate kills', count: pirateKills, score: pirateKills * PIRATE_KILL_SCORE },
    { label: 'Buildings', count: buildings, score: buildingScore },
    { label: 'WaterTemples', count: waterTemples, score: waterTempleScore },
    { label: 'ForestTemples', count: forestTemples, score: forestTempleScore },
    { label: 'Captured villages', count: stats.villagesCaptured, score: stats.villagesCaptured * CAPTURE_SCORE },
    { label: 'Village upgrades', count: stats.villageUpgrades, score: stats.villageUpgrades * UPGRADE_SCORE },
    { label: 'Skills opened', count: skillsOpened, score: skillsOpened * SKILL_SCORE },
    { label: 'Explored tiles', count: explored, score: explored * EXPLORED_SCORE },
    { label: 'Villages', count: villages, score: villages * VILLAGE_SCORE },
    { label: 'Units', count: units, score: unitScore },
    { label: 'Fast capture-mode bonus', count: 0, score: fastBonus },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/score.ts tests/score.test.ts
git commit -m "feat: itemized score breakdown"
```

---

### Task 4: `rankPlayers`

**Files:**
- Modify: `src/game/gameMode.ts`
- Modify: `tests/gameMode.test.ts`

**Interfaces:**
- Consumes: `totalScore`, `countUnits` (already in `./gameMode`).
- Produces: `rankPlayers(players: Player[], map: GameMap): Player[]` sorted by the `computeWinner` tiebreakers. Task 5 consumes this.

- [ ] **Step 1: Write the failing test**

Append to `tests/gameMode.test.ts`:

```ts
  it('ranks by score, then kills, then fewest units, then name', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a')),
      tile(1, 0, null, unit(1, 'b')),
    );
    const a = player(0, { score: 100, kills: 5 });
    const b = player(1, { score: 100, kills: 3 });
    const c = player(2, { score: 50 });
    const ranked = rankPlayers([a, b, c], map);
    expect(ranked.map((p) => p.index)).toEqual([0, 1, 2]);
  });
```

(Import `rankPlayers`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameMode.test.ts`
Expected: FAIL (`rankPlayers` not defined).

- [ ] **Step 3: Write minimal implementation**

`src/game/gameMode.ts` — add after `computeWinner`:

```ts
export function rankPlayers(players: Player[], map: GameMap): Player[] {
  return [...players].sort((a, b) => {
    const sa = totalScore(map, a);
    const sb = totalScore(map, b);
    if (sa !== sb) return sb - sa;
    if (a.kills !== b.kills) return b.kills - a.kills;
    const ua = countUnits(map, a.index);
    const ub = countUnits(map, b.index);
    if (ua !== ub) return ua - ub;
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameMode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/gameMode.ts tests/gameMode.test.ts
git commit -m "feat: rank players for the game-over screen"
```

---

### Task 5: Game-over screen rework

**Files:**
- Modify: `src/ui/overlays/GameOver.ts`
- Create: `tests/gameOver.test.ts`

**Interfaces:**
- Consumes: `rankPlayers`, `bonusScoreFor` from `./gameMode`; `scoreBreakdown`, `totalScore` from `./score`; `TRIBES`; `makeIcon`.
- Produces: `placeColor(place: number): number` (exported, tested); the GameOver screen with tribe icons + details.

- [ ] **Step 1: Write the failing test**

Create `tests/gameOver.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { GameOver, placeColor } from '../src/ui/overlays/GameOver';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tileTypes';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

describe('GameOver placeColor', () => {
  it('uses gold, silver, bronze, gray for places 1-4', () => {
    expect(placeColor(1)).toBe(0xffd700);
    expect(placeColor(2)).toBe(0xc0c0c0);
    expect(placeColor(3)).toBe(0xcd7f32);
    expect(placeColor(4)).toBe(0x888888);
  });
});

describe('GameOver screen', () => {
  let screen: GameOver;
  let root: Container;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const mount = (): Container => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    players[0].score = 100;
    players[1].score = 50;
    players[2].score = 10;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({
      screen: 'game', players, localPlayerIndex: 0, winnerIndex: 0, mode: 'capture', bonusAwarded: false,
    });
    root = new Container();
    screen = new GameOver();
    screen.mount(makeHost(), root);
    return root;
  };

  afterEach(() => {
    if (screen) screen.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const allTexts = (r: Container): string[] => {
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  const clickIcon = (r: Container, index: number): void => {
    const interactives: Container[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if ((ch as Container).eventMode === 'static') interactives.push(ch as Container);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    interactives[index].emit('pointertap');
  };

  it('selects the current player by default and shows their name', () => {
    const r = mount();
    const texts = allTexts(r);
    const localName = useGameStore.getState().players[0].name;
    expect(texts.some((t) => t.includes(localName))).toBe(true);
  });

  it('shows place badges 1, 2, 3', () => {
    const r = mount();
    const texts = allTexts(r);
    expect(texts.includes('1')).toBe(true);
    expect(texts.includes('2')).toBe(true);
    expect(texts.includes('3')).toBe(true);
  });

  it('switches details when another tribe icon is selected', () => {
    const r = mount();
    const other = useGameStore.getState().players[1].name;
    expect(allTexts(r).some((t) => t.includes(other))).toBe(false);
    clickIcon(r, 1);
    expect(allTexts(r).some((t) => t.includes(other))).toBe(true);
  });
});
```

Note: the default-selected details must include the selected player's name as a header (added in Step 3). The `clickIcon` helper assumes the tribe icons are the first interactive `eventMode === 'static'` children; verify against the actual child order, and if needed select the icon by finding a child whose descendants contain a `Sprite`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameOver.test.ts`
Expected: FAIL (current screen has no tribe icons or details; `placeColor` not exported).

- [ ] **Step 3: Write minimal implementation**

Replace `src/ui/overlays/GameOver.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { scoreBreakdown, totalScore } from '../../game/score';
import { bonusScoreFor, GAME_MODE_NAMES, rankPlayers } from '../../game/gameMode';
import { Player } from '../../game/players';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

export function placeColor(place: number): number {
  if (place === 1) return 0xffd700;
  if (place === 2) return 0xc0c0c0;
  if (place === 3) return 0xcd7f32;
  return 0x888888;
}

const CIRCLE_R = 28;

interface IconView {
  el: Container;
  circle: Graphics;
  playerIndex: number;
}

export class GameOver {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private selectedIndex = 0;
  private details: Container | null = null;
  private icons: IconView[] = [];

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.winnerIndex === null) return;
    const map = gameController.getMap();
    if (!map) return;
    const winner = s.players[s.winnerIndex];
    if (!winner) return;
    const tribe = TRIBES.find((t) => t.id === winner.tribe)!;

    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x0a0a14, alpha: 0.92 });
    el.addChild(bg);

    const ranked = rankPlayers(s.players, map);
    const placeOf = new Map(ranked.map((p, i) => [p.index, i + 1]));
    this.selectedIndex = s.localPlayerIndex;

    let y = 40;
    const banner = makeLabel(`${winner.name} (${tribe.name}) wins!`, { fontSize: 32, fill: tribe.color, fontWeight: '800' });
    banner.anchor.set(0.5, 0.5);
    banner.position.set(host.app.screen.width / 2, y);
    el.addChild(banner);
    y += 40;

    const mode = makeLabel(`Mode: ${GAME_MODE_NAMES[s.mode]}`, { fontSize: 16, fill: 0xcccccc });
    mode.anchor.set(0.5, 0.5);
    mode.position.set(host.app.screen.width / 2, y);
    el.addChild(mode);
    y += 34;

    const ordered = [s.players[s.localPlayerIndex], ...ranked.filter((p) => p.index !== s.localPlayerIndex)];
    const iconRow = new Container();
    const gap = 72;
    this.icons = [];
    ordered.forEach((p, i) => {
      const place = placeOf.get(p.index)!;
      const view = this.makePlayerIcon(p.index, place, () => {
        this.selectedIndex = p.index;
        this.refresh();
      });
      view.el.position.set(i * gap, 0);
      iconRow.addChild(view.el);
      this.icons.push(view);
    });
    const rowW = (ordered.length - 1) * gap;
    iconRow.position.set(host.app.screen.width / 2 - rowW / 2, y);
    el.addChild(iconRow);
    y += 96;

    this.details = new Container();
    this.details.position.set(host.app.screen.width / 2, y);
    el.addChild(this.details);

    const again = new Button({ label: 'Play again', width: 180, onClick: () => useGameStore.getState().setScreen('setup') });
    const menu = new Button({ label: 'Main menu', width: 180, onClick: () => useGameStore.getState().setScreen('start') });
    again.position.set(host.app.screen.width / 2 - 190, host.app.screen.height - 60);
    menu.position.set(host.app.screen.width / 2 + 10, host.app.screen.height - 60);
    el.addChild(again, menu);

    root.addChild(el);
    this.el = el;
    this.refresh();
  }

  private makePlayerIcon(playerIndex: number, place: number, onClick: () => void): IconView {
    const p = useGameStore.getState().players[playerIndex];
    const el = new Container();
    const circle = new Graphics();
    circle.circle(0, 0, CIRCLE_R).fill(0xffffff);
    const clip = new Graphics();
    clip.circle(0, 0, CIRCLE_R).fill(0xffffff);
    const tribe = TRIBES.find((t) => t.id === p.tribe)!;
    const icon = makeIcon(`${tribe.code}-icon.png`, CIRCLE_R * 2);
    icon.mask = clip;
    const badge = new Graphics();
    badge.circle(0, CIRCLE_R - 10, 11).fill(placeColor(place)).stroke({ width: 2, color: 0xffffff });
    const badgeText = makeLabel(String(place), { fontSize: 13, fill: 0x1a1a2e, fontWeight: '800' });
    badgeText.anchor.set(0.5, 0.5);
    badgeText.position.set(0, CIRCLE_R - 10);
    el.addChild(circle, clip, icon, badge, badgeText);
    el.eventMode = 'static';
    el.cursor = 'pointer';
    el.on('pointertap', onClick);
    return { el, circle, playerIndex };
  }

  private refresh(): void {
    if (!this.details || !this.host) return;
    this.icons.forEach((v) => {
      v.circle.clear().circle(0, 0, CIRCLE_R).fill(0xffffff);
      if (v.playerIndex === this.selectedIndex) v.circle.stroke({ width: 4, color: 0x5099ff });
    });
    this.details.removeChildren();
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const player = s.players[this.selectedIndex];
    const tribe = TRIBES.find((t) => t.id === player.tribe)!;
    const fastBonus = s.bonusAwarded && s.winnerIndex === player.index ? bonusScoreFor(s.players.length) : 0;
    const header = makeLabel(`${player.name} (${tribe.name})`, { fontSize: 22, fill: tribe.color, fontWeight: '700' });
    header.anchor.set(0.5, 0);
    header.position.set(0, 0);
    this.details.addChild(header);
    let y = 34;
    for (const item of scoreBreakdown(map, player, fastBonus)) {
      const line = item.score === 0
        ? `${item.label}: ${item.count}`
        : item.count === 0
          ? `${item.label}: ${item.score}`
          : `${item.label}: ${item.count}, Scores: ${item.score}`;
      const label = makeLabel(line, { fontSize: 16, fill: 0xeeeeee });
      label.anchor.set(0.5, 0);
      label.position.set(0, y);
      this.details.addChild(label);
      y += 24;
    }
    const total = makeLabel(`Total: ${totalScore(map, player)}`, { fontSize: 18, fill: 0xffffff, fontWeight: '700' });
    total.anchor.set(0.5, 0);
    total.position.set(0, y + 6);
    this.details.addChild(total);
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameOver.test.ts`
Expected: PASS. (Adjust the `clickIcon` helper if the interactive-children order differs.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/GameOver.ts tests/gameOver.test.ts
git commit -m "feat: detailed game-over score screen"
```

---

### Task 6: Full verification

**Files:**
- None.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: no modified tracked files.
