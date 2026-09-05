# Tutorial Ships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the tutorial with a naval segment: a coastal tutorial map (radius 5, east sea, port tile beside the capital) and seven new steps after the Archer lesson — upgrade village to level 3, open Water+Navigation, build a port, board a ship, upgrade the ship, fight an enemy ship, then the existing end dialog.

**Architecture:** Pure data/map changes live in `src/game/tutorial/`; the step machine in `src/controller/tutorialDirector.ts` gains new step ids, state predicates, and scripted side effects (remove the defeated Warrior, reposition the Warrior beside the port, place/remove the enemy ship). UI needs no new widgets — `toolbarKey` pulses, skill halos, hex markers, and the `[N/M]` counter are all data-driven already. `GameController.tutorialMarkerKeys()` adds dynamic ship/Warrior markers.

**Tech Stack:** TypeScript, PixiJS, Zustand, Vitest.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-05-tutorial-ships-design.md`. Prior tutorial spec/plan still apply (permissive play, skip-if-done, no saves, no AI, ring-5 land to forbid pirates).
- No ring-5 water: `trySpawnPirate` requires water at `hexDistance === map.radius`, so every tile at distance 5 stays land.
- Shared feature coordinates move into `tutorialMap.ts` as exported constants; steps data and the director import them (no drift).
- Commands: `npm test`, `npm run typecheck`.
- Step counter `[N/M]` must stay correct automatically (it derives from `STEP_ORDER`).
- The enemy ship and the Archer-step Warrior both belong to the dummy player (owner `TUTORIAL_ENEMY_PLAYER`).

---

### Task 1: Rework the tutorial map (coastal, radius 5, east sea, richer resources)

**Files:**
- Modify: `src/game/tutorial/tutorialMap.ts`
- Modify: `tests/tutorialMap.test.ts`

**Interfaces:**
- Consumes: existing imports (`allTiles`, `axialKey`, `hexDistance`, `Biome`, `GameMap`, `MapTile`, `TileType`, `claimTileForVillage`, `Player`, `EMPTY_STATS`, `makeUnit`, `Tribe`).
- Produces (new/changed exports; consumed by Tasks 2–4):
  - `export const TUTORIAL_RADIUS = 5`
  - `export const TUTORIAL_CAPITAL = { q: 0, r: 0 }` (unchanged)
  - `export const TUTORIAL_PORT_TILE = { q: 1, r: 0 }`
  - `export const TUTORIAL_ARCHER_ENEMY_PREFERRED = { q: -3, r: 1 }` (replaces `TUTORIAL_ENEMY_PREFERRED`)
  - `export const TUTORIAL_SHIP_ENEMY_PREFERRED = { q: 4, r: 0 }`
  - `export const TUTORIAL_ENEMY_SHIP_ID = 'tutor-enemy-ship'`
  - `export const TUTORIAL_WATER_TILES: { q: number; r: number }[]` = east sea below
  - `export const TUTORIAL_START_WARRIOR_ID` (unchanged), `TUTORIAL_ENEMY_WARRIOR_ID` (unchanged), `TUTORIAL_ENEMY_PLAYER`/`TUTORIAL_HUMAN` (unchanged)

- [ ] **Step 1: Write the failing tests**

Replace `tests/tutorialMap.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { axialKey, hexDistance } from '../src/game/hex';
import { isLandType, isMountainType, isWaterType, TileType } from '../src/game/tileTypes';
import { tileAt } from '../src/game/selection';
import { upgradeVillage } from '../src/game/village';
import {
  TUTORIAL_CAPITAL, TUTORIAL_RADIUS, TUTORIAL_START_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER, TUTORIAL_PORT_TILE,
  TUTORIAL_WATER_TILES, buildTutorialMap, buildTutorialPlayers,
} from '../src/game/tutorial/tutorialMap';

describe('tutorial map', () => {
  it('is a radius-5 disc with no water on the outermost ring', () => {
    const map = buildTutorialMap();
    expect(map.radius).toBe(TUTORIAL_RADIUS);
    const keys = new Set(map.tiles.map((t) => axialKey(t)));
    expect(keys.size).toBe(map.tiles.length);
    for (const t of map.tiles) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(TUTORIAL_RADIUS);
      if (hexDistance({ q: 0, r: 0 }, t) === TUTORIAL_RADIUS) {
        expect(isWaterType(t.terrain)).toBe(false);
      }
    }
  });

  it('puts an east sea with a water tile at distance <= 2 of the capital', () => {
    const map = buildTutorialMap();
    const waters = map.tiles.filter((t) => isWaterType(t.terrain));
    expect(waters.length).toBeGreaterThanOrEqual(TUTORIAL_WATER_TILES.length);
    for (const w of TUTORIAL_WATER_TILES) {
      expect(isWaterType(tileAt(map, w.q, w.r)!.terrain)).toBe(true);
    }
    expect(hexDistance(TUTORIAL_PORT_TILE, TUTORIAL_CAPITAL)).toBeLessThanOrEqual(2);
    expect(isWaterType(tileAt(map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!.terrain)).toBe(true);
  });

  it('keeps the capital, warrior, sawmill and mine tiles usable', () => {
    const map = buildTutorialMap();
    const cap = tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.settlement?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.id).toBe(TUTORIAL_START_WARRIOR_ID);
    // Port tile is claimed by the human from level 1 (distance 1).
    expect(tileAt(map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!.ownedBy).toBe(TUTORIAL_HUMAN);
    // Sawmill land (0,1) stays land next to a forest (-1,1).
    const sawmill = tileAt(map, 0, 1)!;
    expect(isLandType(sawmill.terrain)).toBe(true);
    expect(map.tiles.some((t) => isForestTypeFor(t) && hexDistance(t, sawmill) === 1)).toBe(true);
    // Mine mountain (2,-2) becomes owned after the level-2 claim.
    const mine = tileAt(map, 2, -2)!;
    expect(isMountainType(mine.terrain)).toBe(true);
    upgradeVillage(map, cap);
    expect(tileAt(map, 2, -2)!.ownedBy).toBe(TUTORIAL_HUMAN);
  });

  it('builds one human (rich) and one inactive dummy player', () => {
    const players = buildTutorialPlayers();
    const human = players[0]!;
    const dummy = players[1]!;
    expect(human.isHuman).toBe(true);
    expect(human.isActive).toBe(true);
    expect(human.skills).toEqual([]);
    expect(human.resources).toEqual({ money: 250, wood: 60, stone: 60, ore: 30 });
    expect(dummy.isHuman).toBe(false);
    expect(dummy.isActive).toBe(false);
  });
});

function isForestTypeFor(t: { terrain: TileType }): boolean {
  return t.terrain === TileType.GrasslandForest
    || t.terrain === TileType.DesertForest
    || t.terrain === TileType.TundraForest
    || t.terrain === TileType.TaigaForest
    || t.terrain === TileType.RainforestForest;
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialMap.test.ts`
Expected: FAIL — radius is 4, no east water, resources are the old values.

- [ ] **Step 3: Implement the new map**

Edit `src/game/tutorial/tutorialMap.ts`:

1. Constants:
```ts
export const TUTORIAL_RADIUS = 5;
export const TUTORIAL_CAPITAL = { q: 0, r: 0 };
export const TUTORIAL_PORT_TILE = { q: 1, r: 0 };
export const TUTORIAL_START_WARRIOR_ID = 'tutor-warrior';
export const TUTORIAL_ENEMY_WARRIOR_ID = 'tutor-enemy-warrior';
export const TUTORIAL_ENEMY_SHIP_ID = 'tutor-enemy-ship';
export const TUTORIAL_ARCHER_ENEMY_PREFERRED = { q: -3, r: 1 };
export const TUTORIAL_SHIP_ENEMY_PREFERRED = { q: 4, r: 0 };
export const TUTORIAL_HUMAN = 0;
export const TUTORIAL_ENEMY_PLAYER = 1;
export const TUTORIAL_WATER_TILES: { q: number; r: number }[] = [
  { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 4, r: -1 },
];
```

2. In `buildTutorialMap()` after building `tileMap`, convert the sea tiles to water (before claims):
```ts
  for (const w of TUTORIAL_WATER_TILES) {
    const tile = tileMap.get(axialKey(w));
    if (tile) {
      tile.terrain = TileType.Water;
      tile.height = 0;
    }
  }
```

3. Remove the `TUTORIAL_ENEMY_PREFERRED` export (Task 3 consumes the new names). Drop the decorative `(3,0)` entry from the `variety` list (it is now water) and change the decorative `(-3,1)` to `(-3,1)` land only if desired; otherwise leave the other variety entries as-is (they do not overlap the sea set `(1..4,0)`).

4. In `buildTutorialPlayers()` set the human resources to:
```ts
    resources: { money: 250, wood: 60, stone: 60, ore: 30 },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialMap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/game/tutorial/tutorialMap.ts tests/tutorialMap.test.ts
git commit -m "feat: make tutorial map coastal with an east sea (radius 5)"
```

---

### Task 2: Add the seven naval step definitions

**Files:**
- Modify: `src/game/tutorial/tutorialSteps.ts`
- Modify: `tests/tutorialSteps.test.ts`

**Interfaces:**
- Consumes: `TUTORIAL_CAPITAL`, `TUTORIAL_PORT_TILE` from Task 1.
- Produces:
  - `TutorialStepId` gains: `'upgradeVillage3' | 'openWaterNavigation' | 'buildPort' | 'boardShip' | 'upgradeShip' | 'attackEnemyShip'`
  - `STEP_ORDER` updated; `STEP_CONFIG` updated; `stepCounter` unchanged (derives from `STEP_ORDER`).

- [ ] **Step 1: Write/update the failing test**

Edit `tests/tutorialSteps.test.ts`:

1. Update the expected last steps:
```ts
  it('orders all steps from welcome to end and includes the naval segment', () => {
    expect(STEP_ORDER[0]).toBe('welcome');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('end');
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
    const naval = ['upgradeVillage3', 'openWaterNavigation', 'buildPort', 'boardShip', 'upgradeShip', 'attackEnemyShip'];
    for (const id of naval) expect(STEP_ORDER).toContain(id);
    // Naval steps sit between the archer attack and the end.
    expect(STEP_ORDER.indexOf('attackEnemy')).toBeLessThan(STEP_ORDER.indexOf('upgradeVillage3'));
    expect(STEP_ORDER.indexOf('attackEnemyShip')).toBeLessThan(STEP_ORDER.indexOf('end'));
  });

  it('configures the naval steps with toolbar keys and skill highlights', () => {
    expect(STEP_CONFIG.upgradeVillage3.toolbarKey).toBe('upgrade');
    expect(STEP_CONFIG.buildPort.toolbarKey).toBe('port');
    expect(STEP_CONFIG.upgradeShip.toolbarKey).toBe('upgrade-ship');
    expect(STEP_CONFIG.openWaterNavigation.highlightSkills).toEqual(['water', 'navigation']);
    expect(STEP_CONFIG.boardShip.markers).toEqual([{ q: 1, r: 0 }]);
  });

  it('numbers every message heading with a [N/M] counter', () => {
    const counted = STEP_ORDER.map((id) => stepCounter(id));
    expect(new Set(counted).size).toBe(STEP_ORDER.length);
    expect(stepCounter('welcome')).toBe(`[1/${STEP_ORDER.length}]`);
    expect(stepCounter('end')).toBe(`[${STEP_ORDER.length}/${STEP_ORDER.length}]`);
  });
```

2. Update the existing "7/12" `buildSawmill` counter expectation (it now sits earlier than the naval steps):
```ts
    expect(stepCounter('buildSawmill')).toBe(`[7/${STEP_ORDER.length}]`);
```
(Keep the markers-inside-radius assertion; replace the `4` bound with `TUTORIAL_RADIUS` from `../src/game/tutorial/tutorialMap` if it was hard-coded.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialSteps.test.ts`
Expected: FAIL — new ids/counter missing.

- [ ] **Step 3: Implement the new step data**

Edit `src/game/tutorial/tutorialSteps.ts`:

1. Extend the union:
```ts
  | 'spawnArcher'
  | 'attackEnemy'
  | 'upgradeVillage3'
  | 'openWaterNavigation'
  | 'buildPort'
  | 'boardShip'
  | 'upgradeShip'
  | 'attackEnemyShip'
  | 'end';
```

2. Insert the new ids into `STEP_ORDER` between `'attackEnemy'` and `'end'`.

3. Add config entries (copy follows; port marker uses `TUTORIAL_PORT_TILE`):

```ts
  upgradeVillage3: {
    id: 'upgradeVillage3',
    heading: 'Upgrade your village again',
    text: 'Your village is at its building limit. Select it and press the pulsing Upgrade button (4 wood + 2 stone + 4 money) to reach level 3 and make room for a port.',
    markers: [{ ...TUTORIAL_CAPITAL }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'upgrade',
    dialog: false,
    buttonLabel: '',
  },
  openWaterNavigation: {
    id: 'openWaterNavigation',
    heading: 'Open the Water and Navigation skills',
    text: 'You need Water, then Navigation, to build a port and sail. Open the skill tree and research both — the nodes are highlighted.',
    markers: [],
    highlightSkills: ['water', 'navigation'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  buildPort: {
    id: 'buildPort',
    heading: 'Build a port',
    text: 'Select the highlighted water tile next to your village and press the pulsing Build port button (10 wood + 30 money + 2 ore).',
    markers: [{ ...TUTORIAL_PORT_TILE }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'port',
    dialog: false,
    buttonLabel: '',
  },
  boardShip: {
    id: 'boardShip',
    heading: 'Turn a unit into a ship',
    text: 'Move your Warrior onto the port to turn it into a ship. Ships sail on water and can move then attack in the same turn.',
    markers: [{ ...TUTORIAL_PORT_TILE }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  upgradeShip: {
    id: 'upgradeShip',
    heading: 'Upgrade your ship',
    text: 'Select your ship and press the pulsing Upgrade Ship button (8 money + 4 wood). Level-2 ships move farther.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'upgrade-ship',
    dialog: false,
    buttonLabel: '',
  },
  attackEnemyShip: {
    id: 'attackEnemyShip',
    heading: 'Sail and attack the enemy ship',
    text: 'An enemy ship appeared on the sea. If your ship cannot act yet, end your turn. Then sail within range and click the enemy ship to attack — it will not move.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
```
Import `TUTORIAL_PORT_TILE` at the top of the file alongside `TUTORIAL_CAPITAL`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialSteps.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/game/tutorial/tutorialSteps.ts tests/tutorialSteps.test.ts
git commit -m "feat: add naval tutorial step definitions"
```

---

### Task 3: Extend the TutorialDirector with the naval machine and side effects

**Files:**
- Modify: `src/controller/tutorialDirector.ts`
- Modify: `tests/tutorialDirector.test.ts`

**Interfaces:**
- Consumes: Task 1 constants (`TUTORIAL_PORT_TILE`, `TUTORIAL_SHIP_ENEMY_PREFERRED`, `TUTORIAL_ENEMY_SHIP_ID`, `TUTORIAL_ARCHER_ENEMY_PREFERRED`), `isWaterType`.
- Produces: same `TutorialDirector` API as before, now handling the new steps.

Behavior spec:

- `done(step)` adds:
  - `upgradeVillage3`: capital `level >= 3`.
  - `openWaterNavigation`: `hasSkill(human,'water') && hasSkill(human,'navigation')`.
  - `buildPort`: an owned `port` building exists.
  - `boardShip`: an own unit exists with `shipLevel !== undefined` (was converted by stepping on the port).
  - `upgradeShip`: an own unit exists with `shipLevel >= 2`.
  - `attackEnemyShip`: no dummy unit remains (the enemy ship is gone).
- `completesOnEvents()` adds `attackEnemyShip`: an `attack` event whose attacker (by id) is an own ship (`shipLevel !== undefined`) and `targetIndex === TUTORIAL_ENEMY_PLAYER`.
- Side effects in `enterCurrent()`:
  - entering `'upgradeVillage3'` → `removeDummyUnits()` (clears the defeated Archer Warrior).
  - entering `'boardShip'` → `repositionWarriorForBoarding()`.
  - entering `'attackEnemyShip'` → `placeEnemyShip()`.
  - entering `'end'` → `removeDummyUnits()` (clears the enemy ship).
- The Archer-step enemy now prefers `TUTORIAL_ARCHER_ENEMY_PREFERRED` and must remain a **land** target (existing behavior; only the constant changes).

- [ ] **Step 1: Write the failing tests**

Replace `tests/tutorialDirector.test.ts` with the following (it drives the full tutorial including the naval segment):

```ts
import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/game/simulator';
import {
  buildTutorialMap, buildTutorialPlayers, TUTORIAL_PORT_TILE,
  TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER,
} from '../src/game/tutorial/tutorialMap';
import { TutorialDirector, type TutorialHost } from '../src/controller/tutorialDirector';
import { tileAt } from '../src/game/selection';
import { hexDistance } from '../src/game/hex';
import { isWaterType } from '../src/game/tileTypes';
import { makeUnit } from '../src/game/units';

function makeSim(): Simulator {
  const sim = new Simulator(buildTutorialMap(), buildTutorialPlayers(), 'turns30', { rng: () => 0.99 });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function makeDirector(sim: Simulator): TutorialDirector {
  const host: TutorialHost = { sim: () => sim };
  return new TutorialDirector(host);
}

function run(sim: Simulator, dir: TutorialDirector, cmd: Parameters<Simulator['applyCommand']>[0]): void {
  sim.applyCommand(cmd);
  dir.afterCommand(sim.drainEvents());
}

function warriorUnit(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
}

function archerUnit(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.type === 'archer')!.unit!;
}

function ownShipTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined)!;
}

function dummyTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)!;
}

/** Drives the land + archer segment. Ends on the `upgradeVillage3` step. */
function playToNavalStart(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe('moveUnit');
  run(sim, dir, { type: 'move', unitId: warriorUnit(sim).id, q: 1, r: -1 });
  expect(dir.currentStep()).toBe('upgradeVillage');
  run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
  expect(dir.currentStep()).toBe('openForestry');
  run(sim, dir, { type: 'openSkill', skill: 'forestry' });
  expect(dir.currentStep()).toBe('endTurn1');
  run(sim, dir, { type: 'endTurn' });
  expect(dir.currentStep()).toBe('endTurn2');
  run(sim, dir, { type: 'endTurn' });
  expect(dir.currentStep()).toBe('buildSawmill');
  run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
  expect(dir.currentStep()).toBe('openClimbingSmithery');
  run(sim, dir, { type: 'openSkill', skill: 'climbing' });
  run(sim, dir, { type: 'openSkill', skill: 'smithery' });
  expect(dir.currentStep()).toBe('buildMine');
  run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
  expect(dir.currentStep()).toBe('spawnArcher');
  run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
  expect(dir.currentStep()).toBe('attackEnemy');

  // The freshly-spawned archer cannot act until the next turn.
  run(sim, dir, { type: 'endTurn' });
  const archer = archerUnit(sim);
  const enemy = dummyTile(sim);
  expect(isWaterType(enemy.terrain)).toBe(false); // land warrior lesson
  const firing = sim.map.tiles.find(
    (t) => !t.unit && hexDistance(t, enemy) <= 2 && hexDistance(t, archer) <= 1 && !isWaterType(t.terrain),
  )!;
  run(sim, dir, { type: 'move', unitId: archer.id, q: firing.q, r: firing.r });
  run(sim, dir, { type: 'attack', unitId: archerUnit(sim).id, q: enemy.q, r: enemy.r });
  expect(dir.currentStep()).toBe('upgradeVillage3');
  expect(sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)).toBe(false);
}

/** Opens Water + Navigation and upgrades the village to level 3. */
function playNavalSkills(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe('upgradeVillage3');
  run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
  expect(dir.currentStep()).toBe('openWaterNavigation');
  run(sim, dir, { type: 'openSkill', skill: 'water' });
  expect(dir.currentStep()).toBe('openWaterNavigation');
  run(sim, dir, { type: 'openSkill', skill: 'navigation' });
  expect(dir.currentStep()).toBe('buildPort');
}

describe('TutorialDirector', () => {
  it('walks the full land + naval path to the end step', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    expect(dir.currentStep()).toBe('welcome');
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    const port = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    expect(port.unit).toBeNull();
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    expect(dir.currentStep()).toBe('boardShip');

    // Warrior is staged on a land tile adjacent to the port.
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    expect(isWaterType(warrior.terrain)).toBe(false);
    expect(hexDistance(warrior, port)).toBe(1);
    expect(port.unit).toBeNull();

    run(sim, dir, { type: 'move', unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    expect(dir.currentStep()).toBe('upgradeShip');

    const ship = ownShipTile(sim);
    expect(ship.unit!.shipLevel).toBe(1);
    // Upgrading is allowed the same turn the ship formed.
    run(sim, dir, { type: 'upgradeShip', unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe('attackEnemyShip');

    const enemyShip = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID)!;
    expect(isWaterType(enemyShip.terrain)).toBe(true);
    expect(hexDistance(enemyShip, ship)).toBe(3);

    // Freshly converted ship cannot act until next turn.
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('attackEnemyShip');

    const s2 = ownShipTile(sim);
    const firingWater = sim.map.tiles.find(
      (t) => !t.unit && isWaterType(t.terrain) && hexDistance(t, s2) <= 3 && hexDistance(t, enemyShip) <= 2,
    )!;
    run(sim, dir, { type: 'move', unitId: s2.unit!.id, q: firingWater.q, r: firingWater.r });
    run(sim, dir, { type: 'attack', unitId: ownShipTile(sim).unit!.id, q: enemyShip.q, r: enemyShip.r });
    expect(dir.currentStep()).toBe('end');
    expect(sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)).toBe(false);
  });

  it('repositions the Warrior next to the port before boarding', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    // Teleport the Warrior far away, then build the port; entering boardShip
    // must move the Warrior onto a free land tile adjacent to the port.
    const wTile = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    const wUnit = wTile.unit!;
    const far = tileAt(sim.map, -4, 0)!;
    expect(far.unit).toBeNull();
    wTile.unit = null;
    far.unit = wUnit;
    wUnit.q = far.q;
    wUnit.r = far.r;

    const portTile = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    expect(dir.currentStep()).toBe('boardShip');

    const after = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    expect(isWaterType(after.terrain)).toBe(false);
    expect(hexDistance(after, portTile)).toBe(1);
  });

  it('places the enemy ship elsewhere when the preferred water tile is occupied', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    const portTile = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    run(sim, dir, { type: 'move', unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    const ship = ownShipTile(sim);
    // Occupy the preferred enemy tile (4,0) so the director must fall back.
    const blockerTile = tileAt(sim.map, 4, 0)!;
    blockerTile.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', 4, 0, { id: 'blocker', shipLevel: 1, spawnVillage: null });

    run(sim, dir, { type: 'upgradeShip', unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe('attackEnemyShip');
    const enemyShip = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID)!;
    expect(enemyShip.q === 4 && enemyShip.r === 0).toBe(false);
    expect(isWaterType(enemyShip.terrain)).toBe(true);
    expect(hexDistance(enemyShip, ship)).toBe(3);
  });

  it('skips steps whose objective is already satisfied', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const human = sim.players[TUTORIAL_HUMAN]!;
    human.skills.push('forestry', 'climbing', 'smithery', 'water', 'navigation');
    run(sim, dir, { type: 'move', unitId: warriorUnit(sim).id, q: 1, r: -1 });
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    expect(dir.currentStep()).toBe('endTurn1');
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('buildSawmill');
    expect(dir.afterCommand([])).toBe(false);
    expect(dir.currentStep()).toBe('buildSawmill');
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    expect(dir.currentStep()).toBe('buildMine'); // climbing/smithery already open
  });
});
```

Notes for the implementer:
- `ownShipTile` re-reads the map each time because `doMove` moves the unit and `doAttack` never changes the ship's tile.
- The ship-move firing tile may be any water tile within move range and within range-2 of the enemy ship (e.g. `(3,0)`).
- Because unit flags reset at the round wrap, the extra `endTurn` after boarding is required before the ship can move.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tutorialDirector.test.ts`
Expected: FAIL — unknown step ids / no naval progression.

- [ ] **Step 3: Implement the director changes**

Edit `src/controller/tutorialDirector.ts`:

1. Update imports:
```ts
import { hexDistance } from '../game/hex';
import { isLandType, isWaterType } from '../game/tileTypes';
import {
  TUTORIAL_CAPITAL, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ARCHER_ENEMY_PREFERRED,
  TUTORIAL_SHIP_ENEMY_PREFERRED, TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_PORT_TILE, TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorialMap';
```

2. In `enterCurrent()`:
```ts
  private enterCurrent(): void {
    const step = this.currentStep();
    if (step === 'attackEnemy') this.placeEnemyWarrior();
    else if (step === 'upgradeVillage3') this.removeDummyUnits();
    else if (step === 'boardShip') this.repositionWarriorForBoarding();
    else if (step === 'attackEnemyShip') this.placeEnemyShip();
    else if (step === 'end') this.removeDummyUnits();
  }
```

3. Extend `done()`:
```ts
      case 'upgradeVillage3': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 3;
      }
      case 'openWaterNavigation':
        return hasSkill(human, 'water') && hasSkill(human, 'navigation');
      case 'buildPort':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'port' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'boardShip':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined,
        );
      case 'upgradeShip':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && (t.unit.shipLevel ?? 0) >= 2,
        );
      case 'attackEnemyShip':
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
```

4. Extend `completesOnEvents()` attack handling to distinguish attacker kinds:
```ts
        case 'attackEnemy': {
          if (e.type !== 'attack' || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.type === 'archer') return true;
          break;
        }
        case 'attackEnemyShip': {
          if (e.type !== 'attack' || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.shipLevel !== undefined) return true;
          break;
        }
```

5. Add helper methods and adjust `placeEnemyWarrior()` to prefer `TUTORIAL_ARCHER_ENEMY_PREFERRED`:
```ts
  private placeEnemyWarrior(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const archer = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === 'archer',
    );
    const from = archer ?? tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
    if (!from) return;
    const candidates = sim.map.tiles
      .filter(
        (t) =>
          hexDistance(t, from) === 3 &&
          isLandType(t.terrain) &&
          !t.unit &&
          isExploredFor(t, TUTORIAL_HUMAN),
      )
      .sort(
        (a, b) =>
          hexDistance(a, TUTORIAL_ARCHER_ENEMY_PREFERRED) - hexDistance(b, TUTORIAL_ARCHER_ENEMY_PREFERRED),
      );
    const spot = candidates[0];
    if (!spot) return;
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', spot.q, spot.r, {
      id: TUTORIAL_ENEMY_WARRIOR_ID,
      spawnVillage: null,
    });
  }

  private repositionWarriorForBoarding(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const warrior = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_START_WARRIOR_ID)?.unit;
    if (!warrior || warrior.shipLevel !== undefined) return;
    const currentTile = tileAt(sim.map, warrior.q, warrior.r);
    const stagingOk =
      currentTile !== undefined &&
      !isWaterType(currentTile.terrain) &&
      hexDistance(warrior, TUTORIAL_PORT_TILE) === 1;
    if (stagingOk) return;
    const order = [
      { q: 1, r: -1 }, { q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: -1 },
    ];
    for (const n of order) {
      const t = tileAt(sim.map, n.q, n.r);
      if (!t || t.unit || !isLandType(t.terrain)) continue;
      const fromTile = tileAt(sim.map, warrior.q, warrior.r);
      if (fromTile) fromTile.unit = null;
      t.unit = warrior;
      warrior.q = t.q;
      warrior.r = t.r;
      return;
    }
  }

  private placeEnemyShip(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const ship = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined,
    );
    const from = ship ?? tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r);
    if (!from) return;
    const candidates = sim.map.tiles
      .filter(
        (t) =>
          isWaterType(t.terrain) &&
          !t.unit &&
          hexDistance(t, from) === 3 &&
          isExploredFor(t, TUTORIAL_HUMAN),
      )
      .sort(
        (a, b) =>
          hexDistance(a, TUTORIAL_SHIP_ENEMY_PREFERRED) - hexDistance(b, TUTORIAL_SHIP_ENEMY_PREFERRED),
      );
    const spot = candidates[0];
    if (!spot) return;
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', spot.q, spot.r, {
      id: TUTORIAL_ENEMY_SHIP_ID,
      shipLevel: 1,
      spawnVillage: null,
    });
  }

  private removeDummyUnits(): void {
    const sim = this.host.sim();
    if (!sim) return;
    for (const t of sim.map.tiles) {
      if (t.unit && t.unit.owner === TUTORIAL_ENEMY_PLAYER) t.unit = null;
    }
  }
```

6. Delete the now-unused `removeEnemyWarrior()` method.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tutorialDirector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/controller/tutorialDirector.ts tests/tutorialDirector.test.ts
git commit -m "feat: tutorial director naval steps and side effects"
```

---

### Task 4: Dynamic hex markers for the naval steps

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: Task 1 (`TUTORIAL_ENEMY_SHIP_ID`, `TUTORIAL_START_WARRIOR_ID`), Task 2 step ids.
- Produces: updated `private tutorialMarkerKeys(): Set<string>` so markers follow units.

- [ ] **Step 1: Extend `tutorialMarkerKeys()`**

Edit the method in `src/controller/gameController.ts`:

```ts
  private tutorialMarkerKeys(): Set<string> {
    if (!this.tutorial || !this.sim) return new Set<string>();
    const step = this.tutorial.currentStep();
    const markers = new Set<string>();
    for (const m of STEP_CONFIG[step].markers) markers.add(axialKey(m));
    if (step === 'attackEnemy') {
      const enemy = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_WARRIOR_ID);
      if (enemy) markers.add(axialKey(enemy));
    }
    if (step === 'boardShip') {
      const warrior = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_START_WARRIOR_ID);
      if (warrior) markers.add(axialKey(warrior));
    }
    if (step === 'upgradeShip') {
      const ship = this.sim.map.tiles.find(
        (t) => t.unit && t.unit.owner === 0 && t.unit.shipLevel !== undefined,
      );
      if (ship) markers.add(axialKey(ship));
    }
    if (step === 'attackEnemyShip') {
      const ship = this.sim.map.tiles.find(
        (t) => t.unit && t.unit.owner === 0 && t.unit.shipLevel !== undefined,
      );
      if (ship) markers.add(axialKey(ship));
      const enemy = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID);
      if (enemy) markers.add(axialKey(enemy));
    }
    return markers;
  }
```

Add the missing imports at the top of the file (extend the tutorial import block that already pulls `STEP_CONFIG`, `TUTORIAL_CAPITAL`, and `TUTORIAL_ENEMY_WARRIOR_ID`):
```ts
  TUTORIAL_ENEMY_SHIP_ID,
  TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_START_WARRIOR_ID,
```
(replacing the previous `TUTORIAL_ENEMY_WARRIOR_ID` import).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the controller-adjacent suites**

Run: `npx vitest run tests/tutorialMap.test.ts tests/tutorialSteps.test.ts tests/tutorialDirector.test.ts tests/hudToolbar.test.ts tests/startScreen.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: dynamic tutorial markers for naval steps"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS (all suites, including updated tutorial tests).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual smoke checklist (`npm run dev`)**

Walk through and verify:
1. Tutorial map now shows an east sea with the village on the coast; no water on the outermost ring.
2. The Archer fight happens on land to the west; the enemy Warrior is removed when the naval segment starts.
3. Banners continue: `[12/18]` Upgrade village to level 3 (Upgrade button pulses) → Water/Navigation halos + skills-button pulse → Build port pulse on `(1,0)` → boarding auto-stages the Warrior → ship converts → Upgrade Ship pulse → enemy ship appears 3 hexes away on water and never moves → sail & attack → final end dialog + Return to main menu.
4. No pirates ever spawn; no "Resume" entry; normal games and real-game saves unaffected.

- [ ] **Step 5: Commit any fixes surfaced by the smoke check** as their own small commits.

**End of plan.**
