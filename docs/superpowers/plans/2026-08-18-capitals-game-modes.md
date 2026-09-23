# Capitals & Game Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark each player's starting village as a capital (black dot on its hex), add "Capture the map" and "30 Turns" game modes with a setup-screen selector, mode-specific win conditions, a kill counter, and a game-over overlay.

**Architecture:** `Settlement.capital?` flags the starting owned village (rendered as a black dot). A pure `src/game/gameMode.ts` provides mode names, expected-turns, bonus, capture-winner and turn-30 winner computation (score → kills → fewer units → alphabetical). `Player.kills` tracks kills. The controller checks win conditions after captures and at round end, ends the game via `endGame`, and the HUD shows a mode label + a `GameOverScreen` overlay.

**Tech Stack:** TypeScript, PixiJS 8, React, Zustand, Vitest.

## Global Constraints

- `Settlement.capital?: boolean` — `true` only for each player's owned starting village.
- `Player.kills: number` starts 0.
- `GameMode = 'capture' | 'turns30'`; store `mode` default `'capture'`; `GAME_MODE_NAMES = { capture: 'Capture the map', turns30: '30 Turns' }`.
- `expectedTurnsFor(playerCount) = playerCount * 5 + 5`; `bonusScoreFor(playerCount) = playerCount * 10`.
- Capture mode: game ends when one player owns all **owned** settlements (free villages ignored); winner gets the bonus if `turn <= expectedTurns`.
- 30 Turns mode: game ends when `turn >= 30`; winner = max `totalScore` → max `kills` → min units on map → earliest name (active players only).
- Kills are incremented on every kill (human and AI paths), for the killer's player.
- Game over: `store.gameOver`, `store.winnerIndex`, `store.bonusAwarded`, `store.expectedTurns`; a full-screen `GameOverScreen` overlay; input frozen while shown.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: Capital flag + black dot

**Files:**
- Modify: `src/game/mapGen.ts` (`Settlement.capital?`, set on owned starts)
- Modify: `src/render/mapRenderer.ts` (black dot on capital villages)
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Produces: `Settlement.capital?: boolean`; owned starting villages have `capital: true`.

- [ ] **Step 1: Add the failing test** — in `tests/mapGen.test.ts`:

```ts
  it('marks each owned starting village as capital, free villages not', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned.length).toBeGreaterThan(0);
    for (const t of owned) {
      expect(t.settlement!.capital).toBe(true);
    }
    for (const f of free) {
      expect(f.settlement!.capital).toBeFalsy();
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mapGen.test.ts`
Expected: FAIL — `capital` is undefined on owned starts.

- [ ] **Step 3: Add `capital` to `Settlement` and set it in `src/game/mapGen.ts`**

Add `capital?: boolean;` to the `Settlement` interface. In the settlement-placement loop, set `capital: true` for the owned start village (the `start` in each `spawns` pair):

```ts
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1, captureReady: false, name: villageNames[p * 2], capital: true };
    tileMap.get(axialKey(free))!.settlement = { owner: null, level: 1, captureReady: false, name: villageNames[p * 2 + 1] };
```

- [ ] **Step 4: Draw the capital dot in `src/render/mapRenderer.ts`**

After the settlement sprite block in the tile loop, add:

```ts
    if (tile.settlement && tile.settlement.capital) {
      const capitalDot = new Graphics();
      capitalDot.circle(p.x, y, hexSize * 0.08).fill(0x000000);
      container.addChild(capitalDot);
    }
```

- [ ] **Step 5: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapGen.ts src/render/mapRenderer.ts tests/mapGen.test.ts
git commit -m "feat: flag starting villages as capitals with a black dot"
```

---

### Task 2: GameMode helpers + Player.kills

**Files:**
- Create: `src/game/gameMode.ts`
- Modify: `src/game/players.ts` (`Player.kills`, init 0)
- Test: `tests/gameMode.test.ts` (new)
- Modify test Player literals (add `kills: 0`): `tests/buildings.test.ts`, `tests/score.test.ts`, `tests/spawn.test.ts`, `tests/unitActions.test.ts`, `tests/players.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–4):
  - `export type GameMode = 'capture' | 'turns30';`
  - `export const GAME_MODE_NAMES: Record<GameMode, string>`
  - `export function expectedTurnsFor(playerCount: number): number`
  - `export function bonusScoreFor(playerCount: number): number`
  - `export function countUnits(map: GameMap, playerIndex: number): number`
  - `export function captureWinnerIndex(map: GameMap): number | null`
  - `export function computeWinner(players: Player[], map: GameMap): number`
  - `Player.kills: number`

- [ ] **Step 1: Write the failing tests** — create `tests/gameMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import {
  bonusScoreFor,
  captureWinnerIndex,
  computeWinner,
  countUnits,
  expectedTurnsFor,
  GAME_MODE_NAMES,
} from '../src/game/gameMode';

function tile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
  ownedBy: number | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null };
}

function player(index: number, overrides: Partial<Player> = {}): Player {
  return {
    index, tribe: Tribe.Villagers, isHuman: index === 0, name: `P${index}`,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive: true,
    ...overrides,
  };
}

function unit(owner: number, id: string): Unit {
  return { id, owner, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null };
}

describe('gameMode', () => {
  it('has mode names', () => {
    expect(GAME_MODE_NAMES.capture).toBe('Capture the map');
    expect(GAME_MODE_NAMES.turns30).toBe('30 Turns');
  });

  it('computes expected turns and bonus', () => {
    expect(expectedTurnsFor(2)).toBe(15);
    expect(expectedTurnsFor(3)).toBe(20);
    expect(expectedTurnsFor(4)).toBe(25);
    expect(bonusScoreFor(2)).toBe(20);
    expect(bonusScoreFor(4)).toBe(40);
  });

  it('counts units on the map per player', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a')),
      tile(1, 0, null, unit(0, 'b')),
      tile(2, 0, null, unit(1, 'c')),
    );
    expect(countUnits(map, 0)).toBe(2);
    expect(countUnits(map, 1)).toBe(1);
  });

  it('captureWinnerIndex returns the single owner of all owned villages, ignoring free ones', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(2, 0, { owner: null, level: 1, captureReady: false }),
    );
    expect(captureWinnerIndex(map)).toBe(1);
  });

  it('captureWinnerIndex returns null when ownership is split', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 0, level: 1, captureReady: false }, null, 0),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
    );
    expect(captureWinnerIndex(map)).toBeNull();
  });

  it('computeWinner picks the highest score', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'B', score: 10 }), player(1, { name: 'A', score: 20 })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner breaks score ties by kills', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'A', score: 10, kills: 2 }), player(1, { name: 'B', score: 10, kills: 5 })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner breaks score+kills ties by fewer units', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = player(0, { name: 'A', score: 10, kills: 2 });
    const b = player(1, { name: 'B', score: 10, kills: 2 });
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a1')),
      tile(1, 0, null, unit(0, 'a2')),
      tile(2, 0, null, unit(1, 'b1')),
    );
    expect(computeWinner([a, b], map)).toBe(1);
  });

  it('computeWinner breaks all ties alphabetically', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'Zed' }), player(1, { name: 'Alice' })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner ignores inactive players', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'A', score: 999, isActive: false }), player(1, { name: 'B' })];
    expect(computeWinner(players, map)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/gameMode.test.ts`
Expected: FAIL — `Cannot find module '../src/game/gameMode'`.

- [ ] **Step 3: Create `src/game/gameMode.ts`**

```ts
import { GameMap } from './mapGen';
import { Player } from './players';
import { totalScore } from './score';

export type GameMode = 'capture' | 'turns30';

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  capture: 'Capture the map',
  turns30: '30 Turns',
};

export function expectedTurnsFor(playerCount: number): number {
  return playerCount * 5 + 5;
}

export function bonusScoreFor(playerCount: number): number {
  return playerCount * 10;
}

export function countUnits(map: GameMap, playerIndex: number): number {
  return map.tiles.filter((t) => t.unit && t.unit.owner === playerIndex).length;
}

export function captureWinnerIndex(map: GameMap): number | null {
  const owners = new Set<number>();
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner !== null) owners.add(t.settlement.owner);
  }
  return owners.size === 1 ? [...owners][0] : null;
}

export function computeWinner(players: Player[], map: GameMap): number {
  const active = players.filter((p) => p.isActive);
  let best = active.slice();
  const maxScore = Math.max(...best.map((p) => totalScore(map, p)));
  best = best.filter((p) => totalScore(map, p) === maxScore);
  if (best.length > 1) {
    const maxKills = Math.max(...best.map((p) => p.kills));
    best = best.filter((p) => p.kills === maxKills);
  }
  if (best.length > 1) {
    const minUnits = Math.min(...best.map((p) => countUnits(map, p.index)));
    best = best.filter((p) => countUnits(map, p.index) === minUnits);
  }
  if (best.length > 1) {
    best = [best.sort((a, b) => a.name.localeCompare(b.name))[0]];
  }
  return best[0].index;
}
```

- [ ] **Step 4: Add `kills` to `Player` in `src/game/players.ts`**

Add `kills: number;` to the interface and `kills: 0,` to both player objects in `buildPlayers`.

- [ ] **Step 5: Add `kills: 0` to test Player literals**

- `tests/buildings.test.ts` — `player()`: add `kills: 0,` (after `score: 0,`).
- `tests/score.test.ts` — `player()`: add `kills: 0,` (after `score,`).
- `tests/spawn.test.ts` — `makePlayer` return: add `, kills: 0` (after `score: 0`).
- `tests/unitActions.test.ts` — `player()`: add `kills: 0,`.
- `tests/players.test.ts` — add a test:

```ts
  it('players start with 0 kills', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players.every((p) => p.kills === 0)).toBe(true);
  });
```

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/gameMode.ts src/game/players.ts tests/gameMode.test.ts tests/buildings.test.ts tests/score.test.ts tests/spawn.test.ts tests/unitActions.test.ts tests/players.test.ts
git commit -m "feat: add game-mode helpers and player kill counter"
```

---

### Task 3: Store fields + controller win/kill/end wiring

**Files:**
- Modify: `src/store/gameStore.ts` (mode, gameOver, winnerIndex, expectedTurns, bonusAwarded)
- Modify: `src/controller/gameController.ts` (mode param, kills, capture detection, round-end checks, endGame)
- Modify: `src/screens/SetupScreen.tsx` (pass store mode to `startGame`)

**Interfaces:**
- Consumes: `GameMode`, `GAME_MODE_NAMES` (not needed here), `expectedTurnsFor`, `bonusScoreFor`, `captureWinnerIndex`, `computeWinner` from `gameMode.ts`; `Player.kills`; `awardScore` from `score.ts`.
- Produces:
  - Store: `mode: GameMode`, `setMode(mode)`, `gameOver: boolean`, `setGameOver(open)`, `winnerIndex: number | null`, `setWinnerIndex(i)`, `expectedTurns: number`, `setExpectedTurns(n)`, `bonusAwarded: boolean`, `setBonusAwarded(b)`.
  - `gameController.startGame(tribe: Tribe, enemyCount: number, mode: GameMode): void`.
  - `gameController.endGame(winnerIndex: number): void` (private).
  - Kill counters incremented on every kill (human + AI).

- [ ] **Step 1: Add store fields** — in `src/store/gameStore.ts`

Add to the interface, initial state, and setters (following the existing `skillTreeOpen` pattern):

```ts
  mode: 'capture' | 'turns30';
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;

  setMode: (mode: 'capture' | 'turns30') => void;
  setGameOver: (over: boolean) => void;
  setWinnerIndex: (index: number | null) => void;
  setExpectedTurns: (turns: number) => void;
  setBonusAwarded: (awarded: boolean) => void;
```

```ts
  mode: 'capture',
  gameOver: false,
  winnerIndex: null,
  expectedTurns: 0,
  bonusAwarded: false,

  setMode: (mode) => set({ mode }),
  setGameOver: (over) => set({ gameOver: over }),
  setWinnerIndex: (index) => set({ winnerIndex: index }),
  setExpectedTurns: (turns) => set({ expectedTurns: turns }),
  setBonusAwarded: (awarded) => set({ bonusAwarded: awarded }),
```

- [ ] **Step 2: Update `startGame` in `src/controller/gameController.ts`**

Imports: add `bonusScoreFor, captureWinnerIndex, computeWinner, expectedTurnsFor, type GameMode` from `../game/gameMode`.

Change the signature to `startGame(tribe: Tribe, enemyCount: number, mode: GameMode): void` and add mode setup after `store.setPlayers(players);`:

```ts
    store.setMode(mode);
    store.setExpectedTurns(expectedTurnsFor(players.length));
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
```

- [ ] **Step 3: Add `endGame` and the kill increments**

Add after `openSkill`:

```ts
  private endGame(winnerIndex: number): void {
    const store = useGameStore.getState();
    const players = store.players;
    const winner = players[winnerIndex];
    const bonus =
      store.mode === 'capture' && store.turn <= store.expectedTurns
        ? bonusScoreFor(players.length)
        : 0;
    if (bonus > 0) {
      awardScore(winner, bonus);
      store.setBonusAwarded(true);
    }
    store.setWinnerIndex(winnerIndex);
    store.setPlayers([...players]);
    store.setGameOver(true);
    store.setAiActive(false);
    store.setSelection(null);
    showPopup(`${winner.name} wins!`, { background: tribeBackground(winner) });
    this.render();
  }

  private checkCaptureWin(): boolean {
    const w = captureWinnerIndex(this.map!);
    if (w !== null) {
      this.endGame(w);
      return true;
    }
    return false;
  }
```

In `confirmAttack`, add `kills` increments next to the score awards:

```ts
    if (result.targetDied) {
      attackerPlayer.kills += 1;
      this.spawnScoreFly(targetTile, attackerPlayer.index, KILL_SCORE);
    }
    if (result.attackerDied) {
      targetPlayer.kills += 1;
      this.spawnScoreFly(attackerTile!, targetPlayer.index, KILL_SCORE);
    }
```

In the AI attack handler in `runAiPhase`, add kills:

```ts
            if (result.targetDied) {
              attackerPlayer.kills += 1;
              awardScore(attackerPlayer, KILL_SCORE);
            }
            if (result.attackerDied) {
              targetPlayer.kills += 1;
              awardScore(targetPlayer, KILL_SCORE);
            }
```

- [ ] **Step 4: Capture-mode win checks**

In `captureSelectedVillage` (human), after `store.setPlayers([...players]);` add:

```ts
    if (store.mode === 'capture' && this.checkCaptureWin()) return;
```

In the AI `capture` handler in `runAiPhase`, after `store.setPlayers([...players]);` add:

```ts
            if (store.mode === 'capture' && this.checkCaptureWin()) return;
```

- [ ] **Step 5: Round-end mode checks**

In `runAiPhase`, after `store.setPlayers([...players]);` (which persists income) and before `store.setAiActive(false);`, add:

```ts
    if (store.mode === 'turns30' && store.turn >= 30) {
      this.endGame(computeWinner(store.players, this.map));
      return;
    }
    if (store.mode === 'capture' && this.checkCaptureWin()) return;
```

- [ ] **Step 6: Guard input while the game is over**

At the top of `handleMapClick` and `endTurn`, add `if (useGameStore.getState().gameOver) return;` (in `endTurn`, after the existing `aiActive` guard).

- [ ] **Step 7: Update `src/screens/SetupScreen.tsx` call site**

Change the Start button to pass the store mode:

```tsx
import { useGameStore } from '../store/gameStore';
...
const mode = useGameStore((s) => s.mode);
...
<button onClick={() => gameController.startGame(tribe, enemies, mode)}>Start</button>
```

- [ ] **Step 8: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 9: Commit**

```bash
git add src/store/gameStore.ts src/controller/gameController.ts src/screens/SetupScreen.tsx
git commit -m "feat: wire game modes, win detection, kills and end-game"
```

---

### Task 4: Mode selector, mode label, game-over screen

**Files:**
- Modify: `src/screens/SetupScreen.tsx` (mode selector buttons)
- Create: `src/screens/GameOverScreen.tsx`
- Modify: `src/screens/GameScreen.tsx` (mode label + overlay)
- Modify: `index.html` (`#mode-label` CSS, shift `#players-list` down)

**Interfaces:**
- Consumes: `GAME_MODE_NAMES`, `GameMode` from `gameMode.ts`; store `mode`/`setMode`/`gameOver`/`winnerIndex`/`bonusAwarded`; `totalScore` from `score.ts`; `gameController.getMap()`.

- [ ] **Step 1: Add the mode selector to `src/screens/SetupScreen.tsx`**

Add `GameMode`/`GAME_MODE_NAMES` import from `../game/gameMode` and the store `mode`/`setMode` reads. Add a "Mode" section between "Enemies" and the Start button:

```tsx
      <h2>Mode</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['capture', 'turns30'] as GameMode[]).map((m) => (
          <button key={m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>
            {GAME_MODE_NAMES[m]}
          </button>
        ))}
      </div>
```

- [ ] **Step 2: Create `src/screens/GameOverScreen.tsx`**

```tsx
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { TRIBES } from '../game/tribes';
import { totalScore } from '../game/score';
import { GAME_MODE_NAMES } from '../game/gameMode';

export function GameOverScreen(): React.ReactElement {
  const players = useGameStore((s) => s.players);
  const winnerIndex = useGameStore((s) => s.winnerIndex);
  const bonusAwarded = useGameStore((s) => s.bonusAwarded);
  const mode = useGameStore((s) => s.mode);
  const setScreen = useGameStore((s) => s.setScreen);
  if (winnerIndex === null) return <></>;
  const map = gameController.getMap();
  const winner = players[winnerIndex];
  const tribe = TRIBES.find((t) => t.id === winner.tribe)!;
  const ranked = [...players]
    .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
    .sort((a, b) => b.score - a.score);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,20,0.92)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h1 style={{ color: `#${tribe.color.toString(16).padStart(6, '0')}` }}>
        {winner.name} ({tribe.name}) wins!
      </h1>
      <div style={{ color: '#ccc' }}>Mode: {GAME_MODE_NAMES[mode]}</div>
      {bonusAwarded && <div style={{ color: '#ffd700' }}>Fast-win bonus awarded!</div>}
      <div style={{ background: 'rgba(0,0,0,0.6)', padding: '12px 20px', borderRadius: 8 }}>
        {ranked.map(({ p, score }) => (
          <div key={p.index} style={{ color: `#${TRIBES.find((t) => t.id === p.tribe)!.color.toString(16).padStart(6, '0')}` }}>
            {p.name}: {score} pts (kills: {p.kills})
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setScreen('setup')}>Play again</button>
        <button onClick={() => setScreen('start')}>Main menu</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `src/screens/GameScreen.tsx`**

Import `GameOverScreen` and `GAME_MODE_NAMES`. Read `mode` and `gameOver` from the store. Render the mode label (above the players list) and the overlay:

```tsx
      {gameOver && <GameOverScreen />}
      <div id="mode-label">{GAME_MODE_NAMES[mode]}</div>
```

- [ ] **Step 4: Update `index.html` styles**

Shift `#players-list` down and add the mode label:

```css
    #players-list { position: absolute; top: 40px; left: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
    #mode-label { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #ffd700; }
```

- [ ] **Step 5: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`. Verify:
- Setup screen has a mode selector (default "Capture the map"); capitals show a black dot.
- Capture mode ends when one player owns all taken villages; fast-win bonus shown in the results when `turn <= expectedTurns`.
- 30 Turns mode ends at round 30; winner follows score → kills → fewer units → alphabetical.
- Game-over overlay shows winner, sorted scores, kills, bonus note, and Play again / Main menu buttons.
- Mode label shows above the players list.

- [ ] **Step 7: Commit**

```bash
git add src/screens/SetupScreen.tsx src/screens/GameOverScreen.tsx src/screens/GameScreen.tsx index.html
git commit -m "feat: add mode selector, mode label and game-over screen"
```
