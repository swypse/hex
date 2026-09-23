# Score System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a score system — displayed score = live board count + stored action bonuses — with a gold score circle in the top-left HUD, scores in the sorted players list, and a flying "+N" animation from action hexes toward the score circle.

**Architecture:** A pure `src/game/score.ts` provides constants, `boardScore(map, playerIndex)`, `awardScore(player, amount)`, and `totalScore(map, player)`. `Player` gains a `score` field (stored action bonuses, starts 0). `gameController` awards score and spawns the flying "+N" text on `app.stage` (screen space) driven by `app.ticker`. HUD components (`ScoreInfo`, `PlayersList`) render the totals.

**Tech Stack:** TypeScript, PixiJS 8, React (HUD), Zustand (store), Vitest.

## Global Constraints

- Score values: `VILLAGE_SCORE = 50`, `WARRIOR_SCORE = 5`, `RIDER_SCORE = 6`, `ARCHER_SCORE = 6`, `BUILDING_SCORE = 15`, `UPGRADE_SCORE = 40`, `KILL_SCORE = 10`, `CAPTURE_SCORE = 50`.
- `Player.score: number` starts at 0 (in `buildPlayers`).
- `boardScore` sums only tiles with `ownedBy === playerIndex`: settlement → 50, unit by type (5/6/6), factory/mine → 15 each.
- `totalScore(map, player) = player.score + boardScore(map, player.index)`.
- Score awards apply to human and AI alike.
- Flying "+N" is a stage-level `Text` (survives `render()`'s overlay rebuild), animated on `app.ticker` over 900ms from the hex's screen position toward the fixed target `(40, 40)` (CSS px), fading to alpha 0.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: Score model + pure logic

**Files:**
- Create: `src/game/score.ts`
- Modify: `src/game/players.ts` (add `score` to `Player`, init 0 in `buildPlayers`)
- Test: `tests/score.test.ts` (new)
- Modify test Player literals (add `score: 0`): `tests/spawn.test.ts` (line 22 `makePlayer`), `tests/buildings.test.ts` (line ~29 `player()`)

**Interfaces:**
- Produces (used by Tasks 2–3):
  - `export const VILLAGE_SCORE = 50; export const WARRIOR_SCORE = 5; export const RIDER_SCORE = 6; export const ARCHER_SCORE = 6; export const BUILDING_SCORE = 15; export const UPGRADE_SCORE = 40; export const KILL_SCORE = 10; export const CAPTURE_SCORE = 50;`
  - `boardScore(map: GameMap, playerIndex: number): number`
  - `awardScore(player: Player, amount: number): void`
  - `totalScore(map: GameMap, player: Player): number`
  - `Player.score: number`

- [ ] **Step 1: Write the failing tests** — create `tests/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Building, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit, UnitType } from '../src/game/units';
import {
  ARCHER_SCORE,
  awardScore,
  boardScore,
  BUILDING_SCORE,
  CAPTURE_SCORE,
  KILL_SCORE,
  RIDER_SCORE,
  totalScore,
  UPGRADE_SCORE,
  VILLAGE_SCORE,
  WARRIOR_SCORE,
} from '../src/game/score';

function unit(type: UnitType, owner: number): Unit {
  return {
    id: 'u',
    owner,
    type,
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
  };
}

function tile(
  q: number,
  r: number,
  ownedBy: number | null,
  settlement: Settlement | null = null,
  u: Unit | null = null,
  building: Building | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit: u, ownedBy, claimedByVillage: null, building };
}

function player(score = 0): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money: 0 },
    isActive: true,
    score,
  };
}

describe('score constants', () => {
  it('has the specified values', () => {
    expect(VILLAGE_SCORE).toBe(50);
    expect(WARRIOR_SCORE).toBe(5);
    expect(RIDER_SCORE).toBe(6);
    expect(ARCHER_SCORE).toBe(6);
    expect(BUILDING_SCORE).toBe(15);
    expect(UPGRADE_SCORE).toBe(40);
    expect(KILL_SCORE).toBe(10);
    expect(CAPTURE_SCORE).toBe(50);
  });
});

describe('boardScore', () => {
  it('counts villages, units by type, and buildings', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }),
      tile(1, 0, 0, null, unit('warrior', 0)),
      tile(2, 0, 0, null, unit('rider', 0)),
      tile(3, 0, 0, null, unit('archer', 0)),
      tile(4, 0, 0, null, null, { kind: 'factory', level: 1 }),
      tile(5, 0, 0, null, null, { kind: 'mine', level: 1 }),
    );
    expect(boardScore(map, 0)).toBe(
      VILLAGE_SCORE + WARRIOR_SCORE + RIDER_SCORE + ARCHER_SCORE + BUILDING_SCORE + BUILDING_SCORE,
    );
  });

  it('ignores tiles owned by other players', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }),
      tile(1, 0, 1, { owner: 1, level: 1, captureReady: false }),
      tile(2, 0, 1, null, unit('warrior', 1)),
    );
    expect(boardScore(map, 0)).toBe(VILLAGE_SCORE);
    expect(boardScore(map, 1)).toBe(VILLAGE_SCORE + WARRIOR_SCORE);
  });
});

describe('awardScore', () => {
  it('adds the amount to the player score', () => {
    const p = player(10);
    awardScore(p, KILL_SCORE);
    expect(p.score).toBe(10 + KILL_SCORE);
  });
});

describe('totalScore', () => {
  it('sums stored score and board score', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }));
    const p = player(UPGRADE_SCORE);
    expect(totalScore(map, p)).toBe(UPGRADE_SCORE + VILLAGE_SCORE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/score.test.ts`
Expected: FAIL — `Cannot find module '../src/game/score'`.

- [ ] **Step 3: Create `src/game/score.ts`**

```ts
import { GameMap } from './mapGen';
import { Player } from './players';

export const VILLAGE_SCORE = 50;
export const WARRIOR_SCORE = 5;
export const RIDER_SCORE = 6;
export const ARCHER_SCORE = 6;
export const BUILDING_SCORE = 15;
export const UPGRADE_SCORE = 40;
export const KILL_SCORE = 10;
export const CAPTURE_SCORE = 50;

const UNIT_SCORE: Record<string, number> = {
  warrior: WARRIOR_SCORE,
  rider: RIDER_SCORE,
  archer: ARCHER_SCORE,
};

export function boardScore(map: GameMap, playerIndex: number): number {
  let score = 0;
  for (const tile of map.tiles) {
    if (tile.ownedBy !== playerIndex) continue;
    if (tile.settlement) score += VILLAGE_SCORE;
    if (tile.unit) score += UNIT_SCORE[tile.unit.type] ?? 0;
    if (tile.building) score += BUILDING_SCORE;
  }
  return score;
}

export function awardScore(player: Player, amount: number): void {
  player.score += amount;
}

export function totalScore(map: GameMap, player: Player): number {
  return player.score + boardScore(map, player.index);
}
```

- [ ] **Step 4: Add `score` to `Player` in `src/game/players.ts`**

Add `score: number;` to the `Player` interface. Initialize it in `buildPlayers` for both the human and enemy players: change `resources: { ...START_RESOURCES }, isActive: true,` to `resources: { ...START_RESOURCES }, score: 0, isActive: true,` in both player objects.

- [ ] **Step 5: Add `score: 0` to test Player literals**

- `tests/spawn.test.ts:22` — `makePlayer` return: `... resources: { wood: 5, stone: 5, money }, isActive: true };` → add `, score: 0` before the closing.
- `tests/buildings.test.ts` — `player()` helper: `resources: { wood: 0, stone: 0, money }, isActive: true,` → add `score: 0,`.

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass (170 existing + new score tests).

- [ ] **Step 7: Commit**

```bash
git add src/game/score.ts src/game/players.ts tests/score.test.ts tests/spawn.test.ts tests/buildings.test.ts
git commit -m "feat: add score model and board scoring"
```

---

### Task 2: Score awards + flying "+N" animation

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `awardScore`, `KILL_SCORE`, `CAPTURE_SCORE`, `UPGRADE_SCORE` from `score.ts`; `Player.score` from Task 1.
- Produces: `gameController.spawnScoreFly(tile: MapTile, amount: number): void` (private).

- [ ] **Step 1: Add imports to `src/controller/gameController.ts`**

Change the pixi import (line 1) to include `Text`:

```ts
import { Application, Container, Sprite, Text, type Ticker } from 'pixi.js';
```

Add after the `buildings` import:

```ts
import { awardScore, CAPTURE_SCORE, KILL_SCORE, UPGRADE_SCORE } from '../game/score';
```

Add a module constant near the other constants (after `CAMERA_MARGIN_TILES`):

```ts
const SCORE_FLY_DURATION_MS = 900;
const SCORE_FLY_TARGET = { x: 40, y: 40 };
```

- [ ] **Step 2: Add the `spawnScoreFly` method**

Add after `buildSelectedBuilding`:

```ts
  private spawnScoreFly(tile: MapTile, amount: number): void {
    if (!this.app) return;
    const scale = this.baseScale * this.zoom;
    const world = hexToPixel(tile, HEX_SIZE);
    const text = new Text({
      text: `+${amount}`,
      style: { fontSize: 24, fill: 0xffd700, stroke: { color: 0x000000, width: 4 } },
    });
    text.anchor.set(0.5);
    const start = { x: this.pan.x + world.x * scale, y: this.pan.y + world.y * scale };
    text.position.set(start.x, start.y);
    this.app.stage.addChild(text);

    const tickStart = performance.now();
    const ticker = this.app.ticker;
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - tickStart) / SCORE_FLY_DURATION_MS);
      text.position.set(
        start.x + (SCORE_FLY_TARGET.x - start.x) * t,
        start.y + (SCORE_FLY_TARGET.y - start.y) * t,
      );
      text.alpha = 1 - t;
      text.scale.set(1 + t * 0.4, 1 + t * 0.4);
      if (t >= 1) {
        ticker.remove(fn);
        this.app?.stage.removeChild(text);
        text.destroy();
      }
    };
    ticker.add(fn);
  }
```

The text is added to `app.stage` (not `this.overlay`), so it survives the overlay rebuild that `render()` performs.

- [ ] **Step 3: Award + fly in `upgradeSelectedVillage` (human)**

In `upgradeSelectedVillage`, after `upgradeVillage(this.map, tile);` add:

```ts
    awardScore(players[0], UPGRADE_SCORE);
    this.spawnScoreFly(tile, UPGRADE_SCORE);
```

- [ ] **Step 4: Award + fly in `confirmAttack` (human)**

After `const result = performAttack(this.map, attacker, targetTile);` add:

```ts
    if (result.targetDied) {
      awardScore(attackerPlayer, KILL_SCORE);
      this.spawnScoreFly(targetTile, KILL_SCORE);
    }
    if (result.attackerDied) {
      awardScore(targetPlayer, KILL_SCORE);
      this.spawnScoreFly(attackerTile!, KILL_SCORE);
    }
    store.setPlayers([...players]);
```

The `store.setPlayers([...players])` persists the score changes (attack did not previously mutate player objects).

- [ ] **Step 5: Award + fly in `captureSelectedVillage` (human)**

Move `const capturer = players[unit.owner];` up to right after `const result = captureVillage(this.map, village, unit);`, then add the award after it (before the `ownerDied` block). The block becomes:

```ts
    const result = captureVillage(this.map, village, unit);
    const capturer = players[unit.owner];
    awardScore(capturer, CAPTURE_SCORE);
    this.spawnScoreFly(village, CAPTURE_SCORE);
    if (result.ownerDied) {
```

- [ ] **Step 6: Award + fly in the AI handlers (`runAiPhase`)**

In the `upgrade` branch, after `upgradeVillage(this.map, tile);` add:

```ts
            awardScore(ai, UPGRADE_SCORE);
            this.spawnScoreFly(tile, UPGRADE_SCORE);
```

In the `attack` branch, capture the attacker's tile before `performAttack`. Replace:

```ts
          if (unit && target && target.unit) {
            const attackerPlayer = players[unit.owner];
            const targetPlayer = players[target.unit.owner];
            const result = performAttack(this.map, unit, target);
```

with:

```ts
          if (unit && target && target.unit) {
            const attackerPlayer = players[unit.owner];
            const targetPlayer = players[target.unit.owner];
            const attackerTile = tileAt(this.map, unit.q, unit.r)!;
            const result = performAttack(this.map, unit, target);
            if (result.targetDied) {
              awardScore(attackerPlayer, KILL_SCORE);
              this.spawnScoreFly(target, KILL_SCORE);
            }
            if (result.attackerDied) {
              awardScore(targetPlayer, KILL_SCORE);
              this.spawnScoreFly(attackerTile, KILL_SCORE);
            }
```

In the `capture` branch, replace:

```ts
            captureVillage(this.map, village, unit);
            for (const p of players) {
```

with:

```ts
            captureVillage(this.map, village, unit);
            const capturer = players[unit.owner];
            awardScore(capturer, CAPTURE_SCORE);
            this.spawnScoreFly(village, CAPTURE_SCORE);
            for (const p of players) {
```

and remove the now-duplicate `const capturer = players[unit.owner];` line that follows the `store.setPlayers([...players]);` in that branch.

(AI score mutations are persisted by the existing `store.setPlayers([...players])` at the end of the phase.)

- [ ] **Step 7: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 8: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: award scores for upgrade, kill, capture with flying indicator"
```

---

### Task 3: Score HUD — gold circle + players list

**Files:**
- Create: `src/screens/hud/ScoreInfo.tsx`
- Modify: `src/screens/hud/PlayersList.tsx` (scores + sort desc)
- Modify: `src/screens/GameScreen.tsx` (mount `ScoreInfo`)
- Modify: `index.html` (gold circle styles; move `#players-list` below it)

**Interfaces:**
- Consumes: `totalScore(map, player)` from `score.ts`; `gameController.getMap()`.

- [ ] **Step 1: Create `src/screens/hud/ScoreInfo.tsx`**

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { totalScore } from '../../game/score';

export function ScoreInfo(): React.ReactElement {
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  if (!player) return <div id="score-info" />;
  const map = gameController.getMap();
  const score = map ? totalScore(map, player) : player.score;
  return <div id="score-info">{score}</div>;
}
```

- [ ] **Step 2: Update `src/screens/hud/PlayersList.tsx`**

Replace the file body with:

```tsx
import { useGameStore } from '../../store/gameStore';
import { TRIBES } from '../../game/tribes';
import { totalScore } from '../../game/score';
import { gameController } from '../../controller/gameController';

export function PlayersList(): React.ReactElement {
  const players = useGameStore((s) => s.players);
  const map = gameController.getMap();
  const ranked = [...players]
    .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
    .sort((a, b) => b.score - a.score);
  return (
    <div id="players-list">
      {ranked.map(({ p, score }) => {
        const tribe = TRIBES.find((t) => t.id === p.tribe)!;
        const color = `#${tribe.color.toString(16).padStart(6, '0')}`;
        const role = p.isHuman ? ' (you)' : ' (AI)';
        return (
          <div key={p.index} style={{ color, textDecoration: p.isActive ? 'none' : 'line-through' }}>
            {p.name} ({tribe.name}){role}: {score} pts
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Mount `ScoreInfo` in `src/screens/GameScreen.tsx`**

Add the import `import { ScoreInfo } from './hud/ScoreInfo';` and render `<ScoreInfo />` right before `<PlayersList />`.

- [ ] **Step 4: Update `index.html` styles**

Change the `#players-list` rule `top: 8px; left: 8px;` to `top: 84px; left: 8px;` so it sits below the score circle. Add after it:

```css
    #score-info {
      position: absolute; top: 8px; left: 8px;
      width: 64px; height: 64px; border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #ffe98a, #d4a017);
      color: #1a1a2e; font-size: 24px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      z-index: 5;
    }
```

- [ ] **Step 5: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`. Verify:
- Gold score circle at the top-left shows the current player's total (board + bonuses).
- Upgrading a village, killing an enemy unit, and capturing a village each award the bonus, show a gold "+40"/"+10"/"+50" that flies from the hex toward the circle and fades out, and the circle number increases.
- The players list is below the circle, shows each player's score, and is sorted by score descending.
- Scores update live when board changes (capturing/losing villages, building buildings, killing units).

- [ ] **Step 7: Commit**

```bash
git add src/screens/hud/ScoreInfo.tsx src/screens/hud/PlayersList.tsx src/screens/GameScreen.tsx index.html
git commit -m "feat: show score circle and ranked player scores in HUD"
```
