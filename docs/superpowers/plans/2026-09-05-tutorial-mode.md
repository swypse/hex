# Tutorial Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scripted, fixed-map tutorial mode to the hex strategy game, launched from a new "Tutorial" button on the start screen, that walks the player through the core loop with a sequence of non-blocking instruction banners and automatic step advancement.

**Architecture:** A tutorial is an ordinary `Simulator` (mode `turns30`) over a hand-authored `GameMap` with two players: player 0 (human, active, owns one village) and player 1 (an inactive dummy "Warriors" player that owns nothing and exists so the scripted enemy Warrior has a valid owner). The stock `doEndTurn` skips inactive players, so End Turn collects income and returns to the human with no AI ever running. A `TutorialDirector` state machine observes drained `GameEvent`s in `GameController.runCommand` and advances steps; store fields (`tutorial`, `tutorialStep`, `tutorialHighlightSkills`, `tutorialHighlightEndTurn`) drive a persistent PixiJS overlay, banner, and highlight pulses.

**Tech Stack:** TypeScript, PixiJS 8 (imperative UI), Zustand (vanilla store), Vitest. No React. All UI subscribes to `useGameStore`.

## Global Constraints

- All UI is imperative PixiJS; every widget/overlay subscribes to `useGameStore` and rebuilds on store changes.
- Message copy is fixed (see Task 2 table). Use existing UI primitives (`Button`, `IconButton`, `Dialog`, `makeLabel`, `makePanel`) — do not add new dependencies.
- The tutorial must **never** write a save (`saveGame()` gate) and must never trigger the game-over flow.
- No rule-engine changes in `src/game/simulator.ts`; permissive play (Q4 decision) means steps only advance when their objective is met, and a step already satisfied on entry is skipped (no soft-locks).
- Commands: `npm test` (vitest), `npm run typecheck`. Run targeted test files per task and the full suites before finishing.
- Store additions must default to inactive (`tutorial:false`, `tutorialStep:null`, empty highlight arrays/flag) so normal games are unaffected.

---

### Task 1: Author the fixed tutorial map and players

**Files:**
- Create: `src/game/tutorial/tutorialMap.ts`
- Test: `tests/tutorialMap.test.ts`

**Interfaces:**
- Produces (used by Tasks 2–5):
  - `export const TUTORIAL_RADIUS = 4`
  - `export const TUTORIAL_CAPITAL = { q: 0, r: 0 }`
  - `export const TUTORIAL_START_WARRIOR_ID = 'tutor-warrior'`
  - `export const TUTORIAL_ENEMY_WARRIOR_ID = 'tutor-enemy-warrior'`
  - `export const TUTORIAL_ENEMY_PREFERRED = { q: 2, r: 1 }`
  - `export const TUTORIAL_HUMAN = 0`
  - `export const TUTORIAL_ENEMY_PLAYER = 1`
  - `export function buildTutorialMap(): GameMap`
  - `export function buildTutorialPlayers(): Player[]`

- [ ] **Step 1: Write the failing test**

Create `tests/tutorialMap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { axialKey, hexDistance } from '../src/game/hex';
import { isForestType, isLandType, isMountainType, isWaterType } from '../src/game/tileTypes';
import { tileAt } from '../src/game/selection';
import { upgradeVillage } from '../src/game/village';
import {
  TUTORIAL_CAPITAL, TUTORIAL_RADIUS, TUTORIAL_START_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER, buildTutorialMap, buildTutorialPlayers,
} from '../src/game/tutorial/tutorialMap';

describe('tutorial map', () => {
  it('is a radius-4 land disc with no water and unique tiles', () => {
    const map = buildTutorialMap();
    expect(map.radius).toBe(TUTORIAL_RADIUS);
    const keys = new Set(map.tiles.map((t) => axialKey(t)));
    expect(keys.size).toBe(map.tiles.length);
    for (const t of map.tiles) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(TUTORIAL_RADIUS);
      expect(isWaterType(t.terrain)).toBe(false);
    }
  });

  it('places an owned level-1 capital village with a warrior on it', () => {
    const map = buildTutorialMap();
    const cap = tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.settlement?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.settlement?.level).toBe(1);
    expect(cap.settlement?.capital).toBe(true);
    expect(cap.ownedBy).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.id).toBe(TUTORIAL_START_WARRIOR_ID);
    expect(cap.unit?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.type).toBe('warrior');
  });

  it('claims the level-1 radius so the sawmill tile is owned land next to a forest', () => {
    const map = buildTutorialMap();
    const cap = tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    const radius1 = map.tiles.filter((t) => hexDistance(t, TUTORIAL_CAPITAL) <= 1);
    expect(radius1.length).toBe(7);
    for (const t of radius1) expect(t.ownedBy).toBe(TUTORIAL_HUMAN);
    const sawmillTile = tileAt(map, 0, 1)!;
    expect(sawmillTile.ownedBy).toBe(TUTORIAL_HUMAN);
    expect(isLandType(sawmillTile.terrain)).toBe(true);
    expect(sawmillTile.settlement).toBeNull();
    const adjacentForest = map.tiles.some(
      (t) => isForestType(t.terrain) && hexDistance(t, sawmillTile) === 1,
    );
    expect(adjacentForest).toBe(true);
  });

  it('places one grassland mountain at the future mine tile, inside claim radius 2', () => {
    const map = buildTutorialMap();
    const mine = tileAt(map, 2, -2)!;
    expect(isMountainType(mine.terrain)).toBe(true);
    expect(hexDistance(mine, TUTORIAL_CAPITAL)).toBe(2);
    // After upgrading to level 2 the claim pass must own it.
    upgradeVillage(map, tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!);
    expect(tileAt(map, 2, -2)!.ownedBy).toBe(TUTORIAL_HUMAN);
  });

  it('builds one human (rich, no skills) and one inactive dummy player', () => {
    const [human, dummy] = buildTutorialPlayers();
    expect(human.index).toBe(TUTORIAL_HUMAN);
    expect(human.isHuman).toBe(true);
    expect(human.isActive).toBe(true);
    expect(human.skills).toEqual([]);
    expect(human.resources).toEqual({ money: 70, wood: 20, stone: 20, ore: 5 });
    expect(dummy.index).toBe(TUTORIAL_ENEMY_PLAYER);
    expect(dummy.isHuman).toBe(false);
    expect(dummy.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialMap.test.ts`
Expected: FAIL — module `../src/game/tutorial/tutorialMap` not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/game/tutorial/tutorialMap.ts`:

```ts
import { allTiles, axialKey, hexDistance } from '../hex';
import { Biome } from '../biomes';
import { GameMap, MapTile } from '../mapGen';
import { TileType } from '../tileTypes';
import { claimTileForVillage } from '../claim';
import { Player } from '../players';
import { EMPTY_STATS } from '../score';
import { makeUnit } from '../units';
import { Tribe } from '../tribes';

export const TUTORIAL_RADIUS = 4;
export const TUTORIAL_CAPITAL = { q: 0, r: 0 };
export const TUTORIAL_START_WARRIOR_ID = 'tutor-warrior';
export const TUTORIAL_ENEMY_WARRIOR_ID = 'tutor-enemy-warrior';
export const TUTORIAL_ENEMY_PREFERRED = { q: 2, r: 1 };
export const TUTORIAL_HUMAN = 0;
export const TUTORIAL_ENEMY_PLAYER = 1;

function grassTile(q: number, r: number): MapTile {
  return {
    q,
    r,
    terrain: TileType.GrasslandLand,
    biome: Biome.Grassland,
    height: 0.2,
    settlement: null,
    building: null,
    roadOwner: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [TUTORIAL_HUMAN],
    bonus: null,
  };
}

export function buildTutorialMap(): GameMap {
  const tiles: MapTile[] = allTiles(TUTORIAL_RADIUS).map((c) => grassTile(c.q, c.r));
  const tileMap = new Map<string, MapTile>(tiles.map((t) => [axialKey(t), t]));

  const capital = tileMap.get(axialKey(TUTORIAL_CAPITAL))!;
  capital.settlement = {
    owner: TUTORIAL_HUMAN,
    level: 1,
    captureReady: false,
    name: 'Tutorial Village',
    capital: true,
  };
  capital.unit = makeUnit(TUTORIAL_HUMAN, 'warrior', TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r, {
    id: TUTORIAL_START_WARRIOR_ID,
    spawnVillage: { q: TUTORIAL_CAPITAL.q, r: TUTORIAL_CAPITAL.r },
  });

  // Sawmill tile: land at (0,1) next to a forest at (-1,1).
  tileMap.get(axialKey({ q: -1, r: 1 }))!.terrain = TileType.GrasslandForest;
  // Mine tile: mountain at (2,-2) (claim radius 2 once upgraded).
  tileMap.get(axialKey({ q: 2, r: -2 }))!.terrain = TileType.GrasslandMountain;

  // Level-1 claim (radius 1) exactly like generateMap does.
  for (const t of tileMap.values()) {
    if (hexDistance(t, TUTORIAL_CAPITAL) <= 1) claimTileForVillage(t, capital);
  }

  const spawns = [
    { start: { ...TUTORIAL_CAPITAL }, free: { q: 3, r: 0 } },
    { start: { q: -3, r: 2 }, free: { q: -3, r: 3 } },
  ];
  return { radius: TUTORIAL_RADIUS, tiles: [...tileMap.values()], spawns };
}

export function buildTutorialPlayers(): Player[] {
  const human: Player = {
    index: TUTORIAL_HUMAN,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'You',
    resources: { money: 70, wood: 20, stone: 20, ore: 5 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    knownTribes: [Tribe.Villagers],
    stats: { ...EMPTY_STATS },
  };
  const dummy: Player = {
    index: TUTORIAL_ENEMY_PLAYER,
    tribe: Tribe.Warriors,
    isHuman: false,
    name: 'Warriors',
    resources: { money: 0, wood: 0, stone: 0, ore: 0 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: false,
    knownTribes: [Tribe.Warriors],
    stats: { ...EMPTY_STATS },
  };
  return [human, dummy];
}
```

Verify `EMPTY_STATS` and `PlayerStats` are exported from `src/game/score.ts` (Task 5 checks this too).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialMap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/game/tutorial/tutorialMap.ts tests/tutorialMap.test.ts
git commit -m "feat: author fixed tutorial map and players"
```

---

### Task 2: Define the tutorial step sequence (pure data)

**Files:**
- Create: `src/game/tutorial/tutorialSteps.ts`
- Test: `tests/tutorialSteps.test.ts`

**Interfaces:**
- Consumes: constants from Task 1 (`TUTORIAL_CAPITAL`).
- Produces (used by Tasks 4–9):
  - `export type TutorialStepId`
  - `export const STEP_ORDER: TutorialStepId[]`
  - `export interface TutorialStepDef { id; heading; text; markers: { q: number; r: number }[]; highlightSkills: SkillId[]; highlightEndTurn: boolean; pulseSkillsButton: boolean; dialog: boolean; buttonLabel: string }`
  - `export const STEP_CONFIG: Record<TutorialStepId, TutorialStepDef>`
  - `export function skillPulseStep(step: TutorialStepId | null): boolean` (true for `openForestry`/`openClimbingSmithery`)

- [ ] **Step 1: Write the failing test**

Create `tests/tutorialSteps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allTiles } from '../src/game/hex';
import { SKILLS, type SkillId } from '../src/game/skills';
import { buildTutorialMap } from '../src/game/tutorial/tutorialMap';
import { STEP_ORDER, STEP_CONFIG, skillPulseStep, type TutorialStepDef } from '../src/game/tutorial/tutorialSteps';

const markerExists = (map: ReturnType<typeof buildTutorialMap>, m: { q: number; r: number }): boolean =>
  map.tiles.some((t) => t.q === m.q && t.r === m.r);

describe('tutorial steps', () => {
  it('orders all steps from welcome to end without duplication', () => {
    expect(STEP_ORDER[0]).toBe('welcome');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('end');
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
  });

  it('gives every step a config with heading, body text and a button label', () => {
    for (const id of STEP_ORDER) {
      const def: TutorialStepDef = STEP_CONFIG[id];
      expect(def.id).toBe(id);
      expect(def.heading.length).toBeGreaterThan(0);
      expect(def.text.length).toBeGreaterThan(0);
      expect(def.buttonLabel.length).toBeGreaterThan(0);
    }
  });

  it('points every marker at an existing map tile', () => {
    const map = buildTutorialMap();
    for (const id of STEP_ORDER) {
      for (const m of STEP_CONFIG[id].markers) expect(markerExists(map, m)).toBe(true);
    }
  });

  it('only highlights existing skill ids', () => {
    for (const id of STEP_ORDER) {
      for (const s of STEP_CONFIG[id].highlightSkills) expect(SKILLS[s]).toBeDefined();
    }
  });

  it('highlights forestry during openForestry and climbing+smithery during openClimbingSmithery', () => {
    expect(STEP_CONFIG.openForestry.highlightSkills).toEqual(['forestry']);
    expect(STEP_CONFIG.openClimbingSmithery.highlightSkills).toEqual(['climbing', 'smithery']);
  });

  it('drives the skills-button pulse from the skill steps only', () => {
    expect(skillPulseStep('openForestry')).toBe(true);
    expect(skillPulseStep('openClimbingSmithery')).toBe(true);
    for (const id of STEP_ORDER) {
      if (id !== 'openForestry' && id !== 'openClimbingSmithery') {
        expect(skillPulseStep(id)).toBe(false);
      }
    }
  });

  it('keeps tutorial marker coords inside a radius-4 disc', () => {
    for (const id of STEP_ORDER) {
      for (const m of STEP_CONFIG[id].markers) {
        expect(Math.max(Math.abs(m.q), Math.abs(m.r), Math.abs(m.q + m.r))).toBeLessThanOrEqual(4);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialSteps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/game/tutorial/tutorialSteps.ts`:

```ts
import type { SkillId } from '../skills';
import { TUTORIAL_CAPITAL } from './tutorialMap';

export type TutorialStepId =
  | 'welcome'
  | 'moveUnit'
  | 'upgradeVillage'
  | 'openForestry'
  | 'endTurn1'
  | 'endTurn2'
  | 'buildSawmill'
  | 'openClimbingSmithery'
  | 'buildMine'
  | 'spawnArcher'
  | 'attackEnemy'
  | 'end';

export interface TutorialStepDef {
  id: TutorialStepId;
  heading: string;
  text: string;
  markers: { q: number; r: number }[];
  highlightSkills: SkillId[];
  highlightEndTurn: boolean;
  pulseSkillsButton: boolean;
  /** Rendered as a blocking dialog (welcome/end) rather than a banner. */
  dialog: boolean;
  /** Label for the dialog button; not used for banners. */
  buttonLabel: string;
}

export const STEP_ORDER: TutorialStepId[] = [
  'welcome',
  'moveUnit',
  'upgradeVillage',
  'openForestry',
  'endTurn1',
  'endTurn2',
  'buildSawmill',
  'openClimbingSmithery',
  'buildMine',
  'spawnArcher',
  'attackEnemy',
  'end',
];

const CAPITAL = { ...TUTORIAL_CAPITAL };

export const STEP_CONFIG: Record<TutorialStepId, TutorialStepDef> = {
  welcome: {
    id: 'welcome',
    heading: 'Welcome to the Hex tutorial',
    text: 'Welcome to the Hex demo. This tutorial teaches you the basics: move a unit, upgrade your village, collect income each turn, research skills, build a sawmill and a mine, spawn an archer, and fight an enemy. Follow each instruction; your current objective is shown at the top of the screen.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: true,
    buttonLabel: 'Continue',
  },
  moveUnit: {
    id: 'moveUnit',
    heading: 'Move your Warrior',
    text: 'Select your Warrior (it is already selected) and click a highlighted tile to move it to a new hex.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  upgradeVillage: {
    id: 'upgradeVillage',
    heading: 'Upgrade your village',
    text: 'Click your village, then press Upgrade (2 wood + 1 stone + 2 money). Each level raises its income, territory and unit capacity.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  openForestry: {
    id: 'openForestry',
    heading: 'Open the Forestry skill',
    text: 'You need wood to build. Open the skill tree (the pulsing skills button, bottom right) and open the Forestry skill. It lets you build sawmills next to forests.',
    markers: [],
    highlightSkills: ['forestry'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  endTurn1: {
    id: 'endTurn1',
    heading: 'End your turn',
    text: 'You are done with this turn. Press the highlighted End Turn button.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: true,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  endTurn2: {
    id: 'endTurn2',
    heading: 'Income is collected each turn',
    text: 'Money is collected each turn: every village pays 3 + its level, minus 1 for each unit above its capacity. Your upgraded village just earned you money. Press End Turn again to collect another turn of income.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: true,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  buildSawmill: {
    id: 'buildSawmill',
    heading: 'Build a sawmill',
    text: 'Select the highlighted tile beside the forest and press Build sawmill (10 money). Sawmills produce +1 wood per adjacent forest each turn.',
    markers: [{ q: 0, r: 1 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  openClimbingSmithery: {
    id: 'openClimbingSmithery',
    heading: 'Research Climbing and Smithery',
    text: 'You will need stone and ore for mines and stronger units. Open the skill tree and research Climbing, then its child Smithery. Both nodes are highlighted.',
    markers: [],
    highlightSkills: ['climbing', 'smithery'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  buildMine: {
    id: 'buildMine',
    heading: 'Build a mine',
    text: 'Select the highlighted mountain and press Build mine (15 money). Mines produce 1 stone and 1 ore each turn.',
    markers: [{ q: 2, r: -2 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  spawnArcher: {
    id: 'spawnArcher',
    heading: 'Spawn an Archer',
    text: 'Select your village and press Spawn, then choose the Archer (6 money). Archers attack from up to 2 hexes away.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  attackEnemy: {
    id: 'attackEnemy',
    heading: 'Attack the enemy Warrior',
    text: 'An enemy Warrior appeared three hexes away. Your fresh Archer cannot act until next turn, so end your turn to let it act — the enemy will not move. Then move your Archer to within 2 hexes and click the enemy to attack it.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  end: {
    id: 'end',
    heading: 'Basic tutorial complete',
    text: 'You now know how to move, upgrade, build, research and fight. Good luck in the real game!',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: true,
    buttonLabel: 'Return to main menu',
  },
};

export function skillPulseStep(step: TutorialStepId | null): boolean {
  return step === 'openForestry' || step === 'openClimbingSmithery';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialSteps.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/game/tutorial/tutorialSteps.ts tests/tutorialSteps.test.ts
git commit -m "feat: define tutorial step sequence data"
```

---

### Task 3: Add tutorial fields to the game store

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `tests/tutorialStore.test.ts`

**Interfaces:**
- Produces (used by all later UI tasks):
  - `tutorial: boolean`, setter `setTutorial(v: boolean)`
  - `tutorialStep: TutorialStepId | null`, setter `setTutorialStep(v: TutorialStepId | null)`
  - `tutorialHighlightSkills: SkillId[]`, setter `setTutorialHighlightSkills(v: SkillId[])`
  - `tutorialHighlightEndTurn: boolean`, setter `setTutorialHighlightEndTurn(v: boolean)`

- [ ] **Step 1: Write the failing test**

Create `tests/tutorialStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

describe('tutorial store fields', () => {
  it('defaults to inactive', () => {
    const s = useGameStore.getState();
    expect(s.tutorial).toBe(false);
    expect(s.tutorialStep).toBeNull();
    expect(s.tutorialHighlightSkills).toEqual([]);
    expect(s.tutorialHighlightEndTurn).toBe(false);
  });

  it('persists tutorial state and highlight setters', () => {
    const s = useGameStore.getState();
    s.setTutorial(true);
    s.setTutorialStep('moveUnit');
    s.setTutorialHighlightSkills(['forestry']);
    s.setTutorialHighlightEndTurn(true);
    const t = useGameStore.getState();
    expect(t.tutorial).toBe(true);
    expect(t.tutorialStep).toBe('moveUnit');
    expect(t.tutorialHighlightSkills).toEqual(['forestry']);
    expect(t.tutorialHighlightEndTurn).toBe(true);
    s.setTutorial(false);
    s.setTutorialStep(null);
    s.setTutorialHighlightSkills([]);
    s.setTutorialHighlightEndTurn(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialStore.test.ts`
Expected: FAIL — `tutorial` does not exist on the store type.

- [ ] **Step 3: Implement the store fields**

Edit `src/store/gameStore.ts`:

1. Add type-only imports (already imports many game types):
```ts
import type { SkillId } from '../game/skills';
import type { TutorialStepId } from '../game/tutorial/tutorialSteps';
```

2. In the `GameStore` interface, add fields after `texturesLoading: boolean;`:
```ts
  tutorial: boolean;
  tutorialStep: TutorialStepId | null;
  tutorialHighlightSkills: SkillId[];
  tutorialHighlightEndTurn: boolean;
```
And setters after `setTexturesLoading`:
```ts
  setTutorial: (v: boolean) => void;
  setTutorialStep: (v: TutorialStepId | null) => void;
  setTutorialHighlightSkills: (v: SkillId[]) => void;
  setTutorialHighlightEndTurn: (v: boolean) => void;
```

3. In the store object add defaults after `texturesLoading: false,`:
```ts
  tutorial: false,
  tutorialStep: null,
  tutorialHighlightSkills: [],
  tutorialHighlightEndTurn: false,
```
and after `setTexturesLoading: (loading) => set({ texturesLoading: loading }),`:
```ts
  setTutorial: (tutorial) => set({ tutorial }),
  setTutorialStep: (tutorialStep) => set({ tutorialStep }),
  setTutorialHighlightSkills: (tutorialHighlightSkills) => set({ tutorialHighlightSkills }),
  setTutorialHighlightEndTurn: (tutorialHighlightEndTurn) => set({ tutorialHighlightEndTurn }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/store/gameStore.ts tests/tutorialStore.test.ts
git commit -m "feat: add tutorial state fields to game store"
```

---

### Task 4: Implement the TutorialDirector state machine

**Files:**
- Create: `src/controller/tutorialDirector.ts`
- Test: `tests/tutorialDirector.test.ts`

**Interfaces:**
- Consumes: Task 1 (`buildTutorialMap`, `buildTutorialPlayers`, `TUTORIAL_*` constants), Task 2 (`STEP_ORDER`, `TutorialStepId`).
- Produces:
  - `export interface TutorialHost { sim(): Simulator | null }`
  - `export class TutorialDirector` with:
    - `constructor(host: TutorialHost)`
    - `currentStep(): TutorialStepId`
    - `start(): void` — reset to `welcome`
    - `welcomeClosed(): boolean` — advance past `welcome`
    - `afterCommand(events: GameEvent[]): boolean` — advance on completed objectives; returns true if step changed or the sim map was mutated (caller must re-render + sync store)
    - `get currentIndex(): number` (for tests/controller)

Completion model (per design doc — every step is a predicate over sim state plus event observation; entering a step that is already satisfied auto-skips, so no soft-locks):

- `moveUnit`: completes on `unitMoved` for `TUTORIAL_START_WARRIOR_ID`; skip if the Warrior is no longer on the capital.
- `upgradeVillage`: completes on `villageUpgraded` at the capital; skip if capital level ≥ 2.
- `openForestry`: completes on `skillOpened` `forestry`; skip if `hasSkill(human, 'forestry')`.
- `endTurn1`/`endTurn2`: complete on `turnStarted` for the human; never skipped by state.
- `buildSawmill`: skip if a `sawmill` owned by the human exists.
- `openClimbingSmithery`: skip if human has both `climbing` and `smithery`.
- `buildMine`: skip if a `mine` owned by the human exists.
- `spawnArcher`: skip if an `archer` owned by the human exists.
- `attackEnemy`: completes on an `attack` where the attacker (resolved by id) is an archer owned by the human and the target owner is `TUTORIAL_ENEMY_PLAYER`; skip if no dummy-owned unit remains.
- Side effects on entering a step: entering `attackEnemy` places the enemy Warrior on the first empty, explored, land tile at exactly distance 3 from the human's archer (preferring `TUTORIAL_ENEMY_PREFERRED`); entering `end` removes it.

- [ ] **Step 1: Write the failing test**

Create `tests/tutorialDirector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildTutorialMap, buildTutorialPlayers, TUTORIAL_CAPITAL } from '../src/game/tutorial/tutorialMap';
import { TutorialDirector, type TutorialHost } from '../src/controller/tutorialDirector';
import { tileAt } from '../src/game/selection';
import { hexDistance } from '../src/game/hex';

function makeSim(): Simulator {
  const sim = new Simulator(buildTutorialMap(), buildTutorialPlayers(), 'turns30', {
    rng: () => 0.99,
  });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function makeDirector(sim: Simulator): { dir: TutorialDirector; host: TutorialHost } {
  const host: TutorialHost = { sim: () => sim };
  return { dir: new TutorialDirector(host), host };
}

function run(sim: Simulator, dir: TutorialDirector, cmd: Parameters<Simulator['applyCommand']>[0]): boolean {
  sim.applyCommand(cmd);
  return dir.afterCommand(sim.drainEvents());
}

describe('TutorialDirector', () => {
  it('walks the full happy path to the end step', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    expect(dir.currentStep()).toBe('welcome');
    dir.welcomeClosed();
    expect(dir.currentStep()).toBe('moveUnit');

    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
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
    expect(dir.currentStep()).toBe('openClimbingSmithery');
    run(sim, dir, { type: 'openSkill', skill: 'smithery' });
    expect(dir.currentStep()).toBe('buildMine');

    run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
    expect(dir.currentStep()).toBe('spawnArcher');

    const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.unit).toBeNull();
    run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
    expect(dir.currentStep()).toBe('attackEnemy');

    // Enemy placed at distance 3 from the archer (on the capital).
    const enemy = sim.map.tiles.find((t) => t.unit?.id === 'tutor-enemy-warrior')!;
    expect(hexDistance(enemy, cap)).toBe(3);

    // Archer cannot act until next turn.
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('attackEnemy');

    const archer = sim.map.tiles.find((t) => t.unit?.type === 'archer')!.unit!;
    run(sim, dir, { type: 'move', unitId: archer.id, q: 1, r: 0 });
    run(sim, dir, { type: 'attack', unitId: archer.id, q: 2, r: 1 });
    expect(dir.currentStep()).toBe('end');

    // Enemy removed by the director.
    expect(sim.map.tiles.some((t) => t.unit?.id === 'tutor-enemy-warrior')).toBe(false);
  });

  it('skips steps whose objective is already satisfied', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const human = sim.players[0]!;
    human.resources = { money: 70, wood: 20, stone: 20, ore: 5 };
    human.skills.push('forestry', 'climbing', 'smithery');

    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
    expect(dir.currentStep()).toBe('upgradeVillage');

    // Upgrading completes upgradeVillage and, because Forestry is already open,
    // the director must skip straight past openForestry to endTurn1.
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    expect(dir.currentStep()).toBe('endTurn1');

    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('endTurn2');
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('buildSawmill');
    // No sawmill yet -> an empty event batch changes nothing.
    expect(dir.afterCommand([])).toBe(false);
    expect(dir.currentStep()).toBe('buildSawmill');

    // Building the sawmill skips openClimbingSmithery (already open) and stops
    // at buildMine (mine not built yet).
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    expect(dir.currentStep()).toBe('buildMine');
  });

  it('falls back to another tile when the preferred enemy tile is occupied', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    run(sim, dir, { type: 'openSkill', skill: 'forestry' });
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    run(sim, dir, { type: 'openSkill', skill: 'climbing' });
    run(sim, dir, { type: 'openSkill', skill: 'smithery' });
    run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
    // Park a unit on the preferred enemy tile (2,1).
    const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    const blocker = sim.map.tiles.find((t) => t.q === 2 && t.r === 1)!;
    blocker.unit = { ...warrior, id: 'blocker', q: 2, r: 1 };
    run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
    expect(dir.currentStep()).toBe('attackEnemy');
    const enemy = sim.map.tiles.find((t) => t.unit?.id === 'tutor-enemy-warrior');
    expect(enemy).toBeDefined();
    expect(enemy!.q === 2 && enemy!.r === 1).toBe(false);
    expect(hexDistance(enemy!, cap)).toBe(3);
  });
});
```

Note: if `afterCommand([])` is too coarse for the "already satisfied" case (the step completes only on events), then adjust the skip design so `afterCommand` re-checks state even with no events. That is exactly what the implementation below does: it always calls `autoAdvanceIfDone()` after any command.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialDirector.test.ts`
Expected: FAIL — module `../src/controller/tutorialDirector` not found.

- [ ] **Step 3: Write the implementation**

Create `src/controller/tutorialDirector.ts`:

```ts
import type { Simulator } from '../game/simulator';
import type { GameEvent } from '../game/events';
import { hexDistance } from '../game/hex';
import { tileAt } from '../game/selection';
import { isLandType } from '../game/tileTypes';
import { isExploredFor } from '../game/explore';
import { hasSkill } from '../game/skills';
import { makeUnit } from '../game/units';
import { STEP_ORDER, type TutorialStepId } from '../game/tutorial/tutorialSteps';
import {
  TUTORIAL_CAPITAL, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ENEMY_PREFERRED,
  TUTORIAL_ENEMY_WARRIOR_ID, TUTORIAL_HUMAN, TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorialMap';

export interface TutorialHost {
  sim(): Simulator | null;
}

export class TutorialDirector {
  private stepIndex = 0;

  constructor(private readonly host: TutorialHost) {}

  start(): void {
    this.stepIndex = 0;
  }

  currentStep(): TutorialStepId {
    return STEP_ORDER[this.stepIndex]!;
  }

  welcomeClosed(): boolean {
    if (this.currentStep() !== 'welcome') return false;
    const before = this.stepIndex;
    this.stepIndex++;
    this.enterCurrent();
    this.autoAdvanceIfDone();
    return this.stepIndex !== before;
  }

  /** Returns true when the director advanced or mutated the sim map. */
  afterCommand(events: GameEvent[]): boolean {
    const step = this.currentStep();
    let changed = false;
    if (step !== 'welcome' && step !== 'end' && this.completesOnEvents(step, events)) {
      this.stepIndex++;
      this.enterCurrent();
      changed = true;
    }
    if (this.autoAdvanceIfDone()) changed = true;
    return changed;
  }

  private autoAdvanceIfDone(): boolean {
    let changed = false;
    for (let guard = 0; guard < STEP_ORDER.length; guard++) {
      const step = this.currentStep();
      if (step === 'welcome' || step === 'end') break;
      if (!this.done(step)) break;
      this.stepIndex++;
      this.enterCurrent();
      changed = true;
    }
    return changed;
  }

  private enterCurrent(): void {
    const step = this.currentStep();
    if (step === 'attackEnemy') this.placeEnemyWarrior();
    else if (step === 'end') this.removeEnemyWarrior();
  }

  private done(step: TutorialStepId): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    const human = sim.players[TUTORIAL_HUMAN];
    if (!human) return false;
    switch (step) {
      case 'moveUnit': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return !cap?.unit || cap.unit.id !== TUTORIAL_START_WARRIOR_ID;
      }
      case 'upgradeVillage': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 2;
      }
      case 'openForestry':
        return hasSkill(human, 'forestry');
      case 'endTurn1':
      case 'endTurn2':
        return false;
      case 'buildSawmill':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'sawmill' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'openClimbingSmithery':
        return hasSkill(human, 'climbing') && hasSkill(human, 'smithery');
      case 'buildMine':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'mine' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'spawnArcher':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === 'archer',
        );
      case 'attackEnemy':
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
      default:
        return false;
    }
  }

  private completesOnEvents(step: TutorialStepId, events: GameEvent[]): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    for (const e of events) {
      switch (step) {
        case 'moveUnit':
          if (e.type === 'unitMoved' && e.unitId === TUTORIAL_START_WARRIOR_ID) return true;
          break;
        case 'upgradeVillage':
          if (
            e.type === 'villageUpgraded' &&
            e.q === TUTORIAL_CAPITAL.q &&
            e.r === TUTORIAL_CAPITAL.r &&
            e.playerIndex === TUTORIAL_HUMAN
          ) {
            return true;
          }
          break;
        case 'openForestry':
          if (e.type === 'skillOpened' && e.playerIndex === TUTORIAL_HUMAN && e.skill === 'forestry') return true;
          break;
        case 'endTurn1':
        case 'endTurn2':
          if (e.type === 'turnStarted' && e.playerIndex === TUTORIAL_HUMAN) return true;
          break;
        case 'attackEnemy':
          if (e.type === 'attack' && e.attackerIndex === TUTORIAL_HUMAN && e.targetIndex === TUTORIAL_ENEMY_PLAYER) {
            const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
            if (attacker?.type === 'archer') return true;
          }
          break;
        default:
          break;
      }
    }
    return false;
  }

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
          hexDistance(a, TUTORIAL_ENEMY_PREFERRED) - hexDistance(b, TUTORIAL_ENEMY_PREFERRED),
      );
    const spot = candidates[0];
    if (!spot) return;
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', spot.q, spot.r, {
      id: TUTORIAL_ENEMY_WARRIOR_ID,
      spawnVillage: null,
    });
  }

  private removeEnemyWarrior(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const tile = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_WARRIOR_ID);
    if (tile) tile.unit = null;
  }
}
```

Note: `attack` events use `targetIndex`, so a hit OR a miss still carries the event and completes the step (matches the design doc).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialDirector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/controller/tutorialDirector.ts tests/tutorialDirector.test.ts
git commit -m "feat: add tutorial director state machine"
```

---

### Task 5: Wire the director into GameController (start/stop/save gating)

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: Task 1 (`buildTutorialMap`, `buildTutorialPlayers`, `TUTORIAL_CAPITAL`), Task 3 store fields, Task 4 `TutorialDirector`/`TutorialHost`.
- Produces (used by UI tasks 6–9):
  - `startTutorial(): Promise<void>`
  - `tutorialWelcomeClosed(): void`
  - `exitTutorial(): void`
  - private `syncTutorialStore(): void`

- [ ] **Step 1: Write a lightweight store-level verification test** (do this first, red)

Add to `tests/tutorialStore.test.ts` a new test that `startTutorial`-adjacent store resets happen — but `startTutorial` needs a Pixi app, so instead assert the reset behavior through the store setters only is already covered. For this task we rely on typecheck plus a manual/game-loop smoke check, and we add a compile-time-only test that `gameController` exposes the three new public methods:

```ts
import { describe, expect, it } from 'vitest';
import { gameController } from '../src/controller/gameController';

describe('gameController tutorial API', () => {
  it('exposes tutorial entry/exit methods', () => {
    expect(typeof gameController.startTutorial).toBe('function');
    expect(typeof gameController.tutorialWelcomeClosed).toBe('function');
    expect(typeof gameController.exitTutorial).toBe('function');
  });
});
```

Add this as a second `describe` block inside `tests/tutorialStore.test.ts` (or a new file `tests/gameControllerTutorial.test.ts`). Run it and confirm it FAILS (methods missing).

- [ ] **Step 2: Implement the controller integration**

Edit `src/controller/gameController.ts`:

1. Imports:
```ts
import { TutorialDirector, type TutorialHost } from './tutorialDirector';
import {
  buildTutorialMap,
  buildTutorialPlayers,
  TUTORIAL_CAPITAL,
} from '../game/tutorial/tutorialMap';
```
(Add these to the existing import block; keep alphabetical-ish grouping consistent with the file.)

2. Add a private field next to `events`:
```ts
  private tutorial: TutorialDirector | null = null;
```

3. Modify `saveGame()` to gate the tutorial:
```ts
  saveGame(): void {
    if (!this.sim || useGameStore.getState().netMode !== 'single') return;
    if (useGameStore.getState().tutorial) return;
    saveRepository.save(this.sim.snapshot());
  }
```

4. Add `syncTutorialStore()` (near `syncStore`):
```ts
  private syncTutorialStore(): void {
    const store = useGameStore.getState();
    if (!this.tutorial) {
      store.setTutorialStep(null);
      store.setTutorialHighlightSkills([]);
      store.setTutorialHighlightEndTurn(false);
      return;
    }
    const step = this.tutorial.currentStep();
    const def = STEP_CONFIG[step];
    store.setTutorialStep(step);
    store.setTutorialHighlightSkills(def.highlightSkills);
    store.setTutorialHighlightEndTurn(def.highlightEndTurn);
  }
```
Add import: `import { STEP_CONFIG, skillPulseStep } from '../game/tutorial/tutorialSteps';`

5. Add the three public methods after `startGame`:
```ts
  startTutorial(): Promise<void> {
    const store = useGameStore.getState();
    const players = buildTutorialPlayers();
    const map = buildTutorialMap();
    this.sim = new Simulator(map, players, 'turns30');
    this.sim.startGame();
    this.sim.drainEvents();
    this.tutorial = new TutorialDirector({ sim: () => this.sim } satisfies TutorialHost);
    this.tutorial.start();
    store.setPlayers(players);
    store.setMode('turns30');
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setOverlay(null);
    store.setTutorial(true);
    this.syncTutorialStore();
    this.syncKnownTribes(false);
    store.setSelection({ kind: 'unit', q: TUTORIAL_CAPITAL.q, r: TUTORIAL_CAPITAL.r });
    store.setScreen('game');
    this.startVillageIntroPending = true;
    return Promise.resolve();
  }

  tutorialWelcomeClosed(): void {
    if (!this.tutorial) return;
    if (this.tutorial.welcomeClosed()) {
      this.syncTutorialStore();
      this.render();
    }
  }

  exitTutorial(): void {
    this.tutorial = null;
    useGameStore.getState().setOverlay(null);
    useGameStore.getState().setTutorial(false);
    useGameStore.getState().setTutorialStep(null);
    useGameStore.getState().setTutorialHighlightSkills([]);
    useGameStore.getState().setTutorialHighlightEndTurn(false);
    useGameStore.getState().setSelection(null);
    useGameStore.getState().setScreen('start');
  }
```

6. Reset tutorial state when starting a normal game — at the top of `startGame`, after `const store = useGameStore.getState();`, add:
```ts
    this.tutorial = null;
    store.setTutorial(false);
    store.setTutorialStep(null);
    store.setTutorialHighlightSkills([]);
    store.setTutorialHighlightEndTurn(false);
```
And the same reset in `resumeGame()` right after `const store = useGameStore.getState();`.

7. Hook events into the director at the end of `runCommand`, replacing the final `this.render();`:
```ts
      await this.presentEvents(events, preExplored);
      this.render();
      if (useGameStore.getState().tutorial && this.tutorial) {
        const changed = this.tutorial.afterCommand(events);
        if (changed) {
          this.syncTutorialStore();
          const store = useGameStore.getState();
          // Once the skill step completes, close the skill tree so the player can
          // see the next banner/objective on the map.
          if (store.overlay?.kind === 'skill' && !skillPulseStep(store.tutorialStep)) {
            store.setOverlay(null);
          }
          this.render();
        }
      }
```
(STEP_CONFIG and skillPulseStep were imported in step 4 above.)

8. In `shutdown()` clear the director reference:
```ts
    this.tutorial = null;
```

- [ ] **Step 3: Run the new test to verify it passes**

Run: `npx vitest run tests/tutorialStore.test.ts`
Expected: PASS (3 tests including the gameController API test).

- [ ] **Step 4: Typecheck & run the full existing controller-adjacent tests**

Run: `npm run typecheck` and `npx vitest run tests/simulatorTurn.test.ts tests/gameScreen.test.ts tests/startScreen.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts tests/tutorialStore.test.ts
git commit -m "feat: wire tutorial director into game controller"
```

---

### Task 6: Tutorial button on the start screen

**Files:**
- Modify: `src/ui/screens/StartScreen.ts`
- Test: `tests/startScreen.test.ts`

**Interfaces:**
- Consumes: `gameController.startTutorial()` from Task 5.

- [ ] **Step 1: Write the failing test**

Append a new `it` inside the existing `describe('StartScreen background images', ...)` block in `tests/startScreen.test.ts` (it already provides `host` and the Pixi text/canvas mocks in its `beforeEach`). The screen's `buttons` array is private; reach it with a cast like the other tests do for `root`:

```ts
  it('shows a Tutorial button alongside Single player and Multiplayer', () => {
    const screen = new StartScreen();
    screen.mount(host);
    const buttons = (screen as unknown as { buttons: unknown[] }).buttons;
    const labels = buttons.map((b) => {
      const btn = b as { children: { text?: string }[] };
      const t = btn.children.find((c) => typeof c.text === 'string');
      return (t?.text as string) ?? '';
    });
    expect(labels).toContain('Single player');
    expect(labels).toContain('Multiplayer');
    expect(labels).toContain('Tutorial');
    screen.destroy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/startScreen.test.ts`
Expected: FAIL — no "Tutorial" label.

- [ ] **Step 3: Implement the button**

Edit `src/ui/screens/StartScreen.ts` `mount()`:

After the `multi` button creation, add:
```ts
    const tutorial = new Button({
      label: 'Tutorial',
      width: 240,
      onClick: () => {
        void gameController.startTutorial();
      },
    });
    const buttons: Button[] = [single, multi, tutorial];
```
(The existing code builds `const buttons: Button[] = [single, multi];` then unshifts Resume. Replace the `[single, multi]` literal with `[single, multi, tutorial]`.)

Keyboard navigation (`↑/↓`/`Enter`) already iterates `this.buttons`, so Tutorial is automatically reachable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/startScreen.test.ts`
Expected: PASS (all tests including the new one).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/ui/screens/StartScreen.ts tests/startScreen.test.ts
git commit -m "feat: add Tutorial button to start screen"
```

---

### Task 7: Tutorial overlay (welcome dialog, objective banner, end dialog)

**Files:**
- Create: `src/ui/overlays/TutorialOverlay.ts`
- Modify: `src/ui/overlays/OverlayManager.ts`
- Test: `tests/tutorialOverlay.test.ts`

**Interfaces:**
- Consumes: Task 2 (`STEP_CONFIG`, `TutorialStepDef`), Task 3 store fields, Task 5 (`gameController.tutorialWelcomeClosed()`, `gameController.exitTutorial()`).
- Produces:
  - `export class TutorialOverlay` implementing the overlay shape `{ mount(host: UIHost, root: Container): void; destroy(): void }`

- [ ] **Step 1: Write the failing test**

Create `tests/tutorialOverlay.test.ts` (modeled on existing overlay tests that fake `Text` metrics and the canvas):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { useGameStore } from '../src/store/gameStore';
import { TutorialOverlay } from '../src/ui/overlays/TutorialOverlay';
import { type UIHost } from '../src/ui/host';
import { buildTutorialPlayers } from '../src/game/tutorial/tutorialMap';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('TutorialOverlay', () => {
  let root: Container;
  let overlay: TutorialOverlay | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    root = new Container();
    useGameStore.setState({
      screen: 'game',
      tutorial: true,
      tutorialStep: 'moveUnit',
      tutorialHighlightSkills: [],
      tutorialHighlightEndTurn: false,
      texturesLoading: false,
      players: buildTutorialPlayers(),
      localPlayerIndex: 0,
      gameOver: false,
    });
  });

  afterEach(() => {
    overlay?.destroy();
    overlay = null;
  });

  it('mounts a banner container while an objective step is active', () => {
    overlay = new TutorialOverlay();
    overlay.mount(makeHost(), root);
    expect(root.children.length).toBeGreaterThan(0);
    const el = (overlay as unknown as { el: Container }).el;
    expect(el.visible).toBe(true);
  });

  it('hides while textures are loading', () => {
    useGameStore.setState({ texturesLoading: true });
    overlay = new TutorialOverlay();
    overlay.mount(makeHost(), root);
    const el = (overlay as unknown as { el: Container }).el;
    expect(el.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tutorialOverlay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TutorialOverlay**

Create `src/ui/overlays/TutorialOverlay.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { STEP_CONFIG, type TutorialStepId } from '../../game/tutorial/tutorialSteps';
import { gameController } from '../../controller/gameController';

const BANNER_MAX_WIDTH = 720;
const BANNER_TOP = 64;

export class TutorialOverlay {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private root: Container | null = null;
  private unsub: (() => void) | null = null;
  private banner: Graphics | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.root = root;
    const el = new Container();
    this.el = el;
    root.addChild(el);
    this.refresh();
    this.unsub = useGameStore.subscribe(() => this.refresh());
  }

  private refresh(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const active = s.screen === 'game' && s.tutorial && !s.texturesLoading;
    this.el.visible = active;
    if (!active) return;
    while (this.el.children.length > 0) this.el.removeChildAt(0).destroy({ children: true });
    const step = s.tutorialStep;
    if (step === null) return;
    const def = STEP_CONFIG[step];
    if (def.dialog) {
      this.buildDialog(def.heading, def.text, def.buttonLabel, step);
    } else {
      this.buildBanner(def.heading, def.text);
    }
  }

  private buildDialog(title: string, text: string, buttonLabel: string, step: TutorialStepId): void {
    if (!this.el || !this.host) return;
    const cardW = 460;
    const tTitle = makeLabel(title, { fontSize: 22, fill: 0xffffff, fontWeight: '700' });
    const tBody = new Text({
      text,
      style: {
        fontFamily: 'Roboto',
        fontSize: 15,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardW - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    });
    const pad = 24;
    const gap = 14;
    const btn = new Button({
      label: buttonLabel,
      width: 200,
      onClick: () => {
        if (step === 'welcome') gameController.tutorialWelcomeClosed();
        else gameController.exitTutorial();
      },
    });
    const cardH = 24 + tTitle.height + gap + tBody.height + 16 + btn.height + 24;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;

    const backdrop = new Graphics();
    backdrop.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    backdrop.eventMode = 'static';
    // Welcome may be dismissed by clicking outside; the end dialog cannot.
    if (step === 'welcome') {
      backdrop.on('pointertap', () => gameController.tutorialWelcomeClosed());
    }
    this.el.addChild(backdrop);

    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x111111);
    card.addChild(bg);
    tTitle.position.set(pad, 24);
    tBody.position.set(pad, 24 + tTitle.height + gap);
    const btnY = 24 + tTitle.height + gap + tBody.height + 16;
    btn.position.set(cardW / 2 - btn.width / 2, btnY);
    card.addChild(tTitle, tBody, btn);
    card.position.set(w / 2 - cardW / 2, h / 2 - cardH / 2);
    this.el.addChild(card);
  }

  private buildBanner(heading: string, text: string): void {
    if (!this.el || !this.host) return;
    const screenW = this.host.app.screen.width;
    const tHead = makeLabel(heading, { fontSize: 18, fill: 0xffd700, fontWeight: '700' });
    const tBody = new Text({
      text,
      style: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: BANNER_MAX_WIDTH - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    });
    tHead.position.set(24, 16);
    tBody.position.set(24, 16 + tHead.height + 6);
    const panelW = Math.min(BANNER_MAX_WIDTH, screenW - 32);
    const panelH = 16 + tHead.height + 6 + tBody.height + 16;
    const panel = new Graphics();
    panel.roundRect(0, 0, panelW, panelH, 10).fill({ color: 0x000000, alpha: 0.72 });
    const box = new Container();
    box.addChild(panel, tHead, tBody);
    box.position.set(screenW / 2 - panelW / 2, BANNER_TOP);
    this.el.addChild(box);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.root = null;
  }
}
```

Note: `Escape` keyboard closing is intentionally NOT wired for dialogs except that welcome's backdrop click and its button both call `tutorialWelcomeClosed()`, and the end dialog only closes via its button. If you want Escape support for the welcome dialog, add a `keydown` listener in `buildDialog` that fires the same welcome close and remove it in `destroy` — optional polish.

- [ ] **Step 4: Register the overlay in OverlayManager**

Edit `src/ui/overlays/OverlayManager.ts`:

1. Import: `import { TutorialOverlay } from './TutorialOverlay';`
2. In the `entries` object add after `welcome`:
```ts
    tutorial: { make: () => new TutorialOverlay(), mounted: null },
```
3. In `active()` add, right after `if (s.centerMessage !== null) active.add('center');`:
```ts
    if (inGame && s.tutorial) active.add('tutorial');
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/tutorialOverlay.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/ui/overlays/TutorialOverlay.ts src/ui/overlays/OverlayManager.ts tests/tutorialOverlay.test.ts
git commit -m "feat: add tutorial overlay for dialogs and banners"
```

---

### Task 8: On-map tutorial marker rings (MapView) and End-Turn/skills button pulses

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/controller/gameController.ts`
- Modify: `src/ui/hud/HudToolbar.ts`
- Modify: `src/ui/hud/HudSkills.ts`
- Modify: `src/ui/hud/HudTurn.ts`
- Modify: `src/ui/overlays/SkillTree.ts`
- Test: `tests/hudTurn.test.ts`, `tests/mapRenderer.test.ts` (compile only if signature changes break callers — signature is optional with default)

**Interfaces:**
- Consumes: Task 2 `STEP_CONFIG`, Task 3 store fields.
- Produces: `MapView.update(..., tutorialMarkerKeys: Set<string> = new Set())` — the new last parameter defaults to empty so every existing caller/tests compiles unchanged.

- [ ] **Step 1: Write the failing tests (light)**

(a) Append a tutorial-label test to `tests/hudTurn.test.ts`. Add a new top-level `describe` at the end of the file (reusing the file's module-level `makePlayer`/`makeHost` helpers and duplicating the small canvas/Text mocks):

```ts
describe('HudTurn tutorial label', () => {
  let root: Container;
  let turn: HudTurn | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    root = new Container();
    useGameStore.setState({ screen: 'start', players: [], turn: 1, currentPlayerIndex: 0, localPlayerIndex: 0, gameOver: false, texturesLoading: false });
  });

  afterEach(() => {
    turn?.destroy();
    turn = null;
  });

  it('shows Tutorial instead of a mode name while store.tutorial is true', () => {
    const players = [makePlayer(0, Tribe.Villagers, [Tribe.Villagers]), makePlayer(1, Tribe.Warriors, [Tribe.Warriors])];
    useGameStore.setState({
      screen: 'game', mode: 'turns30', tutorial: true, turn: 3, players,
      localPlayerIndex: 0, currentPlayerIndex: 0, aiActive: false,
    });
    turn = new HudTurn();
    turn.mount(makeHost(), root);
    const text = (turn as unknown as { text: { text: string } }).text!.text;
    expect(text).toContain('Tutorial. Turn 3');
    expect(text).not.toContain('30 Turns');
    turn.destroy();
    turn = null;
  });
});
```
Run and confirm FAIL (label still says "30 Turns").

(b) Confirm existing renderer/HUD suites pass before changes so we can detect signature regressions:
Run: `npx vitest run tests/mapRenderer.test.ts tests/hudToolbar.test.ts tests/hudSkills.test.ts`
Expected: PASS.

- [ ] **Step 2: Implement the map marker rings**

Edit `src/render/mapRenderer.ts`:

1. Add a field after `private stopSelectedBorder`:
```ts
  private stopTutorialMarkers: (() => void) | null = null;
  private tutorialMarkerParts: { g: Graphics; points: { x: number; y: number }[] }[] = [];
```

2. Add the optional parameter to `update`:
```ts
  update(
    map: GameMap,
    players: Player[],
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    localPlayerIndex: number,
    hiddenUnitIds: Set<string>,
    viewport: Viewport,
    tutorialMarkerKeys: Set<string> = new Set<string>(),
  ): void {
```
3. Pass markers into `drawHighlights` (change the call site at the end of `update`):
```ts
    this.drawHighlights(map, selection, reachableKeys, attackableKeys, reachableColor, tutorialMarkerKeys);
```
4. Extend `drawHighlights` signature and draw gold rings:
```ts
  private drawHighlights(
    map: GameMap,
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    reachableColor: number,
    tutorialMarkerKeys: Set<string> = new Set<string>(),
  ): void {
```
Add at the top of the method body (before the per-tile loop) the marker drawing:
```ts
    this.tutorialMarkerParts = [];
    for (const tile of map.tiles) {
      if (!tutorialMarkerKeys.has(axialKey(tile))) continue;
      const corners = hexCorners(tile, this.hexSize).map((c) => ({
        x: c.x,
        y: c.y - tileElevation(tile, this.hexSize),
      }));
      const ring = this.takeGraphics();
      this.strokePolyline(ring, corners, 4, 0xffd700, 0.95);
      this.container.addChild(ring);
      this.highlights.push(ring);
      this.tutorialMarkerParts.push({ g: ring, points: corners });
    }
    this.startTutorialPulse();
```
(Ensure `hexCorners` and `tileElevation` are imported — they already are in this file.)

5. Add `startTutorialPulse()` (mirror `animateSelectedBorder`):
```ts
  private startTutorialPulse(): void {
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    const parts = this.tutorialMarkerParts;
    if (parts.length === 0) return;
    const draw = (width: number): void => {
      for (const p of parts) this.strokePolyline(p.g, p.points, width, 0xffd700, 0.95);
    };
    draw(4);
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (parts.length === 0) {
        ticker.remove(fn);
        this.stopTutorialMarkers = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      draw(3 + 3 * Math.abs(Math.sin(phase * Math.PI * 2)));
    };
    ticker.add(fn);
    this.stopTutorialMarkers = () => ticker.remove(fn);
  }
```
6. Stop the pulse in `clearHighlights()` (before releasing graphics):
```ts
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    this.tutorialMarkerParts = [];
```
7. Stop the pulse in `destroy()` after `stopSelectedBorder` cleanup:
```ts
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
```

- [ ] **Step 3: Compute markers in GameController.render**

Edit `src/controller/gameController.ts`:

1. Add a helper near `syncTutorialStore`:
```ts
  private tutorialMarkerKeys(): Set<string> {
    const store = useGameStore.getState();
    if (!this.tutorial || !this.sim) return new Set<string>();
    const step = this.tutorial.currentStep();
    const markers = new Set<string>();
    for (const m of STEP_CONFIG[step].markers) markers.add(axialKey(m));
    if (step === 'attackEnemy') {
      const enemy = this.sim.map.tiles.find(
        (t) => t.unit?.id === TUTORIAL_ENEMY_WARRIOR_ID,
      );
      if (enemy) markers.add(axialKey(enemy));
    }
    return markers;
  }
```
(`axialKey` is already imported in the file; extend the tutorial import added in Task 5 with `TUTORIAL_ENEMY_WARRIOR_ID`.)
2. In `render()`, change the `mapView.update(...)` call to pass the markers as the final argument:
```ts
    this.mapView.update(
      this.sim.map,
      store.players,
      selection,
      this.reachableKeys,
      this.attackableKeys,
      store.localPlayerIndex,
      this.hiddenUnitIds,
      {
        x: this.camera!.pan.x,
        y: this.camera!.pan.y,
        scale: this.camera!.scale,
        width: this.app.screen.width,
        height: this.mapHeight(),
      },
      this.tutorialMarkerKeys(),
    );
```

- [ ] **Step 4: Implement the HudToolbar End Turn pulse**

Edit `src/ui/hud/HudToolbar.ts`:

1. Add a field:
```ts
  private stopEndTurnPulse: (() => void) | null = null;
  private endTurnPulse: Graphics | null = null;
```
2. In `update()`, after the endTurn button is added to `endTurnRow`, add:
```ts
    if (store.tutorialHighlightEndTurn && !store.aiActive) {
      const ring = new Graphics();
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.endTurnRow.addChild(ring);
      this.endTurnPulse = ring;
      this.startEndTurnPulse();
    }
```
3. Add the pulse helpers:
```ts
  private startEndTurnPulse(): void {
    if (this.stopEndTurnPulse) return;
    const ticker = this.host!.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.endTurnPulse || this.endTurnPulse.destroyed) {
        ticker.remove(fn);
        this.stopEndTurnPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      this.endTurnPulse.clear();
      this.endTurnPulse.circle(24, 24, 24 + 2 * Math.abs(Math.sin(phase * Math.PI * 2)))
        .stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopEndTurnPulse = () => ticker.remove(fn);
  }
```
4. Stop the pulse at the start of `update()` (with the other tooltip cleanup) and in `destroy()`:
```ts
    if (this.stopEndTurnPulse) {
      this.stopEndTurnPulse();
      this.stopEndTurnPulse = null;
    }
```
Add the same snippet inside `destroy()`.

- [ ] **Step 5: Implement the HudSkills pulse**

Edit `src/ui/hud/HudSkills.ts`:

1. Add fields:
```ts
  private stopSkillsPulse: (() => void) | null = null;
  private pulse: Graphics | null = null;
  private unsub: (() => void) | null = null;
```
2. In `mount`, after creating `btn`, subscribe and add an initial update:
```ts
    this.unsub = useGameStore.subscribe(() => this.update());
    this.update();
```
3. Add `update()`:
```ts
  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const pulseSkills = s.tutorial && skillPulseStep(s.tutorialStep);
    if (!pulseSkills) {
      if (this.pulse) {
        this.pulse.destroy();
        this.pulse = null;
      }
      if (this.stopSkillsPulse) {
        this.stopSkillsPulse();
        this.stopSkillsPulse = null;
      }
      return;
    }
    if (this.pulse) return;
    const size = SKILLS_BUTTON_SIZE;
    const ring = new Graphics();
    ring.circle(size / 2, size / 2, size / 2 + 3).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    this.el.addChild(ring);
    this.pulse = ring;
    const ticker = this.host.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.pulse || this.pulse.destroyed) {
        ticker.remove(fn);
        this.stopSkillsPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      const r = size / 2 + 3 + 2 * Math.abs(Math.sin(phase * Math.PI * 2));
      this.pulse.clear().circle(size / 2, size / 2, r).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopSkillsPulse = () => ticker.remove(fn);
  }
```
4. Import `skillPulseStep` from `../../game/tutorial/tutorialSteps`.
5. Stop/clear in `destroy()`:
```ts
    if (this.stopSkillsPulse) {
      this.stopSkillsPulse();
      this.stopSkillsPulse = null;
    }
    if (this.unsub) this.unsub();
    this.unsub = null;
```

- [ ] **Step 6: Skill-tree node highlight**

Edit `src/ui/overlays/SkillTree.ts`:

1. In `build()`, read the highlight list once near `const human = ...`:
```ts
    const highlight = new Set(useGameStore.getState().tutorialHighlightSkills);
```
2. In the per-skill node loop, before building the node container, draw a highlight ring when the node is not opened yet and `highlight.has(id)`:
```ts
      if (!opened && highlight.has(id)) {
        const halo = new Graphics();
        halo.circle(pos.x, pos.y, 33).stroke({ width: 5, color: 0xffd700, alpha: 0.95 });
        halo.circle(pos.x, pos.y, 38).stroke({ width: 2, color: 0xffd700, alpha: 0.5 });
        ring.addChild(halo);
      }
```
(The halo is added before the node container, so the node circle draws on top.)

- [ ] **Step 7: HudTurn cosmetic label**

Edit `src/ui/hud/HudTurn.ts` `update()`: replace the label construction:
```ts
    let label = s.tutorial ? `Tutorial. Turn ${s.turn}` : `${GAME_MODE_NAMES[s.mode]}. Turn ${s.turn}`;
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/hudTurn.test.ts tests/mapRenderer.test.ts tests/hudToolbar.test.ts tests/hudSkills.test.ts tests/tutorialOverlay.test.ts`
Expected: all PASS (HudTurn new test passes; renderer/HUD existing tests still pass since the signature change is backward-compatible via default param).

- [ ] **Step 9: Typecheck & commit**

Run: `npm run typecheck`
Then:
```bash
git add src/render/mapRenderer.ts src/controller/gameController.ts src/ui/hud/HudToolbar.ts src/ui/hud/HudSkills.ts src/ui/hud/HudTurn.ts src/ui/overlays/SkillTree.ts tests/hudTurn.test.ts
git commit -m "feat: tutorial highlight rings and pulses"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS (all existing + new suites).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke checklist (in `npm run dev`)**

Walk through and verify:
1. Start screen shows Single player, Multiplayer, Tutorial (keyboard nav reaches it).
2. Click Tutorial → "Loading…" → map centered on the village → welcome dialog appears.
3. Welcome closes → banner "Move your Warrior"; the Warrior hex pulses gold; move dots show; moving the Warrior advances to "Upgrade your village".
4. Click the village (now empty), press Upgrade → advances to "Open the Forestry skill"; the skills button pulses; the SkillTree shows a gold halo around Forestry.
5. Open Forestry → skill tree stays open but step banner is behind it; close the skill tree → "End your turn" with a pulsing End Turn ring. Press it → income message; press again → sawmill step.
6. Select the pulsing tile beside the forest, build the sawmill → climbing/smithery step; both nodes haloed in the skill tree.
7. Open both → build mine on the pulsing mountain → spawn Archer at the village → an enemy Warrior appears 3 hexes away; banner explains it; it never moves across End Turns; moving the Archer within range 2 shows the red attack dot; clicking it attacks.
8. Tutorial-complete dialog appears with "Return to main menu"; clicking it returns to a clean start screen with no "Resume" entry.
9. Confirm a pre-existing normal-game save is untouched and "Resume" still works for it; confirm normal single-player games are unaffected (no banner/halos, no tutorial saves).

- [ ] **Step 4: Commit any fixes surfaced by the smoke check** (if the smoke check requires code changes, implement them as their own small commits following the conventions above).

**End of plan.**
