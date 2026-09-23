# Player Names, HP, Turn System, HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unique random player names, unit HP with a visible green bar + text, a turn system with an "End turn" button, a top-center turn/player HUD, a bottom-left selected-object info panel, and tribe-colored unit circles.

**Architecture:** Pure data additions first (`names.ts`, `Unit.hp`, `TILE_TYPE_NAMES`/`UNIT_TYPE_NAMES`) with unit tests; then the turn system + HUD DOM in `gameScreen.ts`/`index.html`; finally rendering changes (`unitTextures` per tribe, HP bar above units) in `textureFactory.ts`/`mapRenderer.ts`. The full-rebuild-on-change render approach is kept.

**Tech Stack:** TypeScript, PixiJS 8 (Graphics, Text, BlurFilter), Vitest, plain HTML/CSS.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `ADJECTIVES` and `ANIMALS` each contain exactly 10 entries.
- Names are `<Adjective> <Animal>` (capitalized), unique within a game (max 3 players).
- `Player` gains `name: string`; `buildPlayers(humanTribe, enemyCount, rng: SeededRandom): Player[]`.
- `Unit` gains `hp: number`; `MAX_HP = 5`; warriors start with `hp = MAX_HP`.
- HUD: `#turn-info` (top center), `#end-turn-btn` (bottom right), `#selected-info` (bottom left).
- Selected info rows for tribe/player are OMITTED when not applicable (terrain, free village).
- `TextureSet.unitTexture` replaced by `unitTextures: Record<Tribe, Texture>`; ghost uses the same tribe-colored texture at alpha 0.5.
- HP bar always visible above each unit circle: dark background rect + green fill scaled to `hp/MAX_HP` + `Text` label `{hp}/{MAX_HP}`.
- Tests: `npm test`; typecheck: `npm run typecheck`; dev: `npm run dev`.
- Commit after each task with the exact message shown.

---

### Task 1: Player names

**Files:**
- Create: `src/game/names.ts`
- Modify: `src/game/players.ts`
- Modify: `src/main.ts`
- Test: `tests/names.test.ts` (new), `tests/players.test.ts` (update)

**Interfaces:**
- Consumes: `random.ts` (`SeededRandom`), `tribes.ts` (`Tribe`, `TRIBES`).
- Produces (used by Task 4): `Player.name: string`, `generatePlayerNames(count, rng): string[]`, `buildPlayers(humanTribe, enemyCount, rng)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/names.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ADJECTIVES, ANIMALS, generatePlayerNames } from '../src/game/names';
import { SeededRandom } from '../src/util/random';

describe('names', () => {
  it('has 10 adjectives and 10 animals', () => {
    expect(ADJECTIVES).toHaveLength(10);
    expect(ANIMALS).toHaveLength(10);
  });

  it('generates the requested count of names, all unique and capitalized', () => {
    const names = generatePlayerNames(3, new SeededRandom(42));
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = generatePlayerNames(2, new SeededRandom(7));
    const b = generatePlayerNames(2, new SeededRandom(7));
    expect(a).toEqual(b);
  });
});
```

Update `tests/players.test.ts` — replace the entire file contents:

```ts
import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';

describe('buildPlayers', () => {
  it('creates a human player and 1 AI with a distinct tribe', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ tribe: Tribe.Villagers, isHuman: true });
    expect(players[1].isHuman).toBe(false);
    expect(players[1].tribe).not.toBe(Tribe.Villagers);
  });

  it('creates 3 players with distinct tribes for 2 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 2, new SeededRandom(42));
    expect(players).toHaveLength(3);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(3);
  });

  it('assigns unique names to every player', () => {
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    expect(players.every((p) => p.name.length > 0)).toBe(true);
    expect(new Set(players.map((p) => p.name)).size).toBe(3);
  });

  it('throws for invalid enemy counts', () => {
    expect(() => buildPlayers(Tribe.Villagers, 0, new SeededRandom(42))).toThrow();
    expect(() => buildPlayers(Tribe.Villagers, 3, new SeededRandom(42))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `names.ts` module not found; `buildPlayers` missing the `name`/`rng` signature.

- [ ] **Step 3: Create `src/game/names.ts`**

```ts
import { SeededRandom } from '../util/random';

export const ADJECTIVES = [
  'fury',
  'glorious',
  'tricky',
  'silent',
  'brave',
  'cunning',
  'savage',
  'noble',
  'ancient',
  'wild',
];

export const ANIMALS = [
  'fox',
  'wolf',
  'bear',
  'hawk',
  'lion',
  'serpent',
  'raven',
  'tiger',
  'boar',
  'eagle',
];

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function generatePlayerNames(count: number, rng: SeededRandom): string[] {
  const combos = ADJECTIVES.flatMap((adj) =>
    ANIMALS.map((animal) => `${capitalize(adj)} ${capitalize(animal)}`),
  );
  return rng.shuffle(combos).slice(0, count);
}
```

- [ ] **Step 4: Update `src/game/players.ts`**

Replace the entire file contents:

```ts
import { SeededRandom } from '../util/random';
import { generatePlayerNames } from './names';
import { Tribe, TRIBES } from './tribes';

export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
}

export function buildPlayers(
  humanTribe: Tribe,
  enemyCount: number,
  rng: SeededRandom,
): Player[] {
  if (enemyCount < 1 || enemyCount > 2) {
    throw new Error(`Enemy count must be 1 or 2, got ${enemyCount}`);
  }
  const enemyTribes = TRIBES.filter((t) => t.id !== humanTribe)
    .map((t) => t.id)
    .slice(0, enemyCount);
  const names = generatePlayerNames(enemyCount + 1, rng);
  const players: Player[] = [{ index: 0, tribe: humanTribe, isHuman: true, name: names[0] }];
  for (const tribe of enemyTribes) {
    players.push({ index: players.length, tribe, isHuman: false, name: names[players.length] });
  }
  return players;
}
```

- [ ] **Step 5: Update `src/main.ts`**

Replace the import block and the `buildPlayers` call:

```ts
import { Application } from 'pixi.js';
import { buildPlayers } from './game/players';
import { Tribe } from './game/tribes';
import { initGameScreen } from './screens/gameScreen';
import { initSetupScreen } from './screens/setupScreen';
import { initStartScreen } from './screens/startScreen';
import { SeededRandom } from './util/random';
```

```ts
  initSetupScreen((tribe: Tribe, enemyCount: number) => {
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)));
    initGameScreen(app, players);
    show('screen-game');
  });
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test`
Expected: PASS (all tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/names.ts src/game/players.ts src/main.ts tests/names.test.ts tests/players.test.ts
git commit -m "feat: add random unique player names"
```

---

### Task 2: Unit HP

**Files:**
- Modify: `src/game/units.ts`
- Modify: `src/game/mapGen.ts`
- Modify: `tests/selection.test.ts` (unit literals gain `hp`)
- Modify: `tests/mapGen.test.ts` (assert `hp`)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–5): `Unit.hp: number`, `MAX_HP = 5`, `UNIT_TYPE_NAMES: Record<UnitType, string>`.

- [ ] **Step 1: Write the failing tests**

Update `tests/selection.test.ts` — the two `Unit` literals (`warrior` and `other`) gain `hp: 5`:

```ts
  const warrior: Unit = {
    id: 'w0',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
    hp: 5,
  };
  const other: Unit = {
    id: 'w1',
    owner: 1,
    type: 'warrior',
    q: -1,
    r: 0,
    hasMoved: false,
    hp: 5,
  };
```

Update `tests/mapGen.test.ts` — replace the `hasMoved` assertion in the warrior-unit test with `hp` also checked:

```ts
      expect(s.unit!.hasMoved).toBe(false);
      expect(s.unit!.hp).toBe(5);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Unit` has no `hp` (typecheck) and `units.ts` missing `MAX_HP`.

- [ ] **Step 3: Update `src/game/units.ts`**

Replace the entire file contents:

```ts
export type UnitType = 'warrior';

export const MAX_HP = 5;

export interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
  hp: number;
}

export const UNIT_MOVEMENT: Record<UnitType, number> = {
  warrior: 1,
};

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  warrior: 'Warrior',
};
```

- [ ] **Step 4: Update `src/game/mapGen.ts`**

Add the import:

```ts
import { MAX_HP, Unit } from './units';
```

Update the unit-placement loop to set `hp`:

```ts
      tile.unit = {
        id: `w${unitId}`,
        owner: tile.settlement.owner,
        type: 'warrior',
        q: tile.q,
        r: tile.r,
        hasMoved: false,
        hp: MAX_HP,
      };
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test`
Expected: PASS (all tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts tests/selection.test.ts tests/mapGen.test.ts
git commit -m "feat: add unit hp"
```

---

### Task 3: Tile type names

**Files:**
- Modify: `src/game/tileTypes.ts`
- Modify: `tests/tileTypes.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 4): `TILE_TYPE_NAMES: Record<TileType, string>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/tileTypes.test.ts`:

```ts
  it('defines a display name for every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(TILE_TYPE_NAMES[type]).toBeTruthy();
    }
    expect(TILE_TYPE_NAMES[TileType.Water]).toBe('Water');
    expect(TILE_TYPE_NAMES[TileType.ForestLand]).toBe('Forest on land');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `TILE_TYPE_NAMES` is not exported / undefined.

- [ ] **Step 3: Update `tests/tileTypes.test.ts` import**

Change the import at the top of `tests/tileTypes.test.ts`:

```ts
import {
  ALL_TILE_TYPES,
  TERRAIN_TYPES,
  TILE_TYPE_COLORS,
  TILE_TYPE_NAMES,
  TileType,
  WEIGHTED_TERRAIN,
} from '../src/game/tileTypes';
```

- [ ] **Step 4: Add `TILE_TYPE_NAMES` to `src/game/tileTypes.ts`**

Append to the end of the file:

```ts
export const TILE_TYPE_NAMES: Record<TileType, string> = {
  [TileType.Land]: 'Land',
  [TileType.Sand]: 'Sand',
  [TileType.Snow]: 'Snow',
  [TileType.ForestLand]: 'Forest on land',
  [TileType.ForestSand]: 'Forest on sand',
  [TileType.ForestSnow]: 'Forest on snow',
  [TileType.Water]: 'Water',
  [TileType.Mountain]: 'Mountain',
  [TileType.Settlement]: 'Settlement',
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/tileTypes.ts tests/tileTypes.test.ts
git commit -m "feat: add tile type display names"
```

---

### Task 4: Turn system + HUD

**Files:**
- Modify: `index.html` (HUD elements + CSS)
- Modify: `src/screens/gameScreen.ts` (turn state, end-turn handler, HUD updates)

**Interfaces:**
- Consumes: `players.ts` (`Player`), `mapGen.ts` (`GameMap`, `tileAt` via `selection.ts`), `selection.ts` (`Selection`, `tileAt`), `tribes.ts` (`TRIBES`), `tileTypes.ts` (`TILE_TYPE_NAMES`), `units.ts` (`UNIT_TYPE_NAMES`).
- Produces: interactive turn counter, end-turn reset, live selected-object info panel.

- [ ] **Step 1: Update `index.html`**

Replace the `#game-root`/`#players-list` CSS block with (add the three new HUD rules):

```css
    #game-root { position: absolute; inset: 0; }
    #players-list { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
    #turn-info { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
    #selected-info { position: absolute; bottom: 16px; left: 16px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
    #end-turn-btn { position: absolute; bottom: 16px; right: 16px; }
```

Replace the game screen `<div>`:

```html
  <div id="screen-game" class="screen hidden">
    <div id="game-root"></div>
    <div id="players-list"></div>
    <div id="turn-info"></div>
    <div id="selected-info"></div>
    <button id="end-turn-btn">End turn</button>
  </div>
```

- [ ] **Step 2: Update `src/screens/gameScreen.ts`**

Replace the entire file contents:

```ts
import { Application, Container } from 'pixi.js';
import { axialKey, pixelToHex } from '../game/hex';
import { generateMap, GameMap } from '../game/mapGen';
import { Player } from '../game/players';
import { cycleSelection, moveUnit, reachableTargets, Selection, tileAt } from '../game/selection';
import { TRIBES } from '../game/tribes';
import { TILE_TYPE_NAMES } from '../game/tileTypes';
import { UNIT_TYPE_NAMES } from '../game/units';
import { renderMap } from '../render/mapRenderer';
import { createTextures } from '../render/textureFactory';

const HEX_SIZE = 40;

function tribeName(player: Player): string {
  return TRIBES.find((t) => t.id === player.tribe)!.name;
}

function selectedInfoHtml(players: Player[], map: GameMap, selection: Selection | null): string {
  if (!selection) return '';
  const tile = tileAt(map, selection.q, selection.r)!;
  const lines: string[] = [];
  if (selection.kind === 'unit') {
    const unit = tile.unit!;
    const player = players[unit.owner];
    lines.push(`<div>Name: ${UNIT_TYPE_NAMES[unit.type]}</div>`);
    lines.push(`<div>Type: unit</div>`);
    lines.push(`<div>Tribe: ${tribeName(player)}</div>`);
    lines.push(`<div>Player: ${player.name}</div>`);
  } else if (selection.kind === 'village') {
    lines.push(`<div>Name: Settlement</div>`);
    lines.push(`<div>Type: village</div>`);
    const owner = tile.settlement!.owner;
    if (owner !== null) {
      const player = players[owner];
      lines.push(`<div>Tribe: ${tribeName(player)}</div>`);
      lines.push(`<div>Player: ${player.name}</div>`);
    }
  } else {
    lines.push(`<div>Name: ${TILE_TYPE_NAMES[tile.terrain]}</div>`);
    lines.push(`<div>Type: terrain</div>`);
  }
  return lines.join('');
}

export function initGameScreen(app: Application, players: Player[]): void {
  document.getElementById('game-root')!.appendChild(app.canvas);

  const list = document.getElementById('players-list')!;
  list.innerHTML = players
    .map((p) => {
      const color = `#${TRIBES.find((t) => t.id === p.tribe)!.color.toString(16).padStart(6, '0')}`;
      const role = p.isHuman ? ' (you)' : ' (AI)';
      return `<div style="color:${color}">${p.name} (${tribeName(p)})${role}</div>`;
    })
    .join('');

  const map: GameMap = generateMap(players.length, Math.floor(Math.random() * 100000));
  const textures = createTextures(app);

  let selection: Selection | null = null;
  let reachableKeys = new Set<string>();
  let mapContainer: Container | null = null;
  let turn = 1;
  const currentPlayer = players[0];

  const turnInfoEl = document.getElementById('turn-info')!;
  const selectedInfoEl = document.getElementById('selected-info')!;

  const updateHud = (): void => {
    turnInfoEl.textContent = `Turn ${turn} — ${currentPlayer.name}`;
    selectedInfoEl.innerHTML = selectedInfoHtml(players, map, selection);
  };

  document.getElementById('end-turn-btn')!.addEventListener('click', () => {
    turn++;
    for (const t of map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
    render();
  });

  const render = (): void => {
    if (mapContainer) app.stage.removeChild(mapContainer);

    reachableKeys = new Set<string>();
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(map, selection.q, selection.r)!;
      const unit = tile.unit!;
      if (unit.owner === 0 && !unit.hasMoved) {
        reachableKeys = new Set(reachableTargets(map, unit).map((t) => axialKey(t)));
      }
    }

    mapContainer = renderMap(app, map, textures, players, selection, reachableKeys, HEX_SIZE);
    mapContainer.eventMode = 'static';
    mapContainer.on('pointertap', (e) => {
      const local = mapContainer!.toLocal(e.global);
      const h = pixelToHex(local.x, local.y, HEX_SIZE);
      const tile = tileAt(map, h.q, h.r);
      if (!tile) return;

      if (
        selection &&
        selection.kind === 'unit' &&
        reachableKeys.has(axialKey(tile))
      ) {
        const unit = tileAt(map, selection.q, selection.r)!.unit!;
        moveUnit(map, unit, tile);
        selection = null;
        render();
        return;
      }

      selection = cycleSelection(selection, tile);
      render();
    });

    app.stage.addChild(mapContainer);
    updateHud();
  };

  render();
}
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 4: Verify manually**

Run `npm run dev`, open the browser, go through Start → setup (1 enemy) → game.
Expected:
- Top center shows `Turn 1 — <name>`.
- Top-left players list shows `Name (Tribe) (you)/(AI)`.
- Bottom-right "End turn" button present.
- Click a terrain tile → bottom-left shows `Name: <terrain>` and `Type: terrain` only.
- Click a village → shows `Name: Settlement`, `Type: village`, and tribe/player rows only if owned.
- Click a human unit → shows `Name: Warrior`, `Type: unit`, `Tribe`, `Player`.
- Move the unit, then click "End turn" → top-center shows `Turn 2 — <name>`, and the unit can be moved again.

- [ ] **Step 5: Commit**

```bash
git add index.html src/screens/gameScreen.ts
git commit -m "feat: add turn system and hud"
```

---

### Task 5: Tribe-colored units + HP bars

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: manual — headless screenshots.

**Interfaces:**
- Consumes: `tribes.ts` (`TRIBES`, `Tribe`), `players.ts` (`Player`), `mapGen.ts` (`MapTile`), `units.ts` (`Unit`, `MAX_HP`), `hex.ts` (`axialKey`, `hexToPixel`).
- Produces: `TextureSet.unitTextures: Record<Tribe, Texture>`; renderer draws tribe-colored units, tribe-colored ghosts, and HP bar + text above each unit.

- [ ] **Step 1: Update `src/render/textureFactory.ts`**

Change `makeUnitTexture` from a single fixed-color function to a per-color function, and expose `unitTextures`. Replace the `makeUnitTexture` function:

```ts
function makeUnitTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.2).fill(color);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Replace the `TextureSet` interface:

```ts
export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTexture: Texture;
  unitTextures: Record<Tribe, Texture>;
  glowTextures: GlowTextures;
}
```

Replace the `createTextures` return block:

```ts
  const unitTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = makeUnitTexture(app, tribe.color, hexSize);
  }
  return {
    tileTextures,
    villageTexture: makeVillageTexture(app, hexSize),
    unitTextures,
    glowTextures,
  };
```

- [ ] **Step 2: Update `src/render/mapRenderer.ts`**

Add imports for `Text` from pixi.js and `MAX_HP`/`Unit` from units:

```ts
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { axialKey, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { MAX_HP, Unit } from '../game/units';
import { TextureSet } from './textureFactory';
```

Add a helper that draws the HP bar above a unit:

```ts
function addHpBar(
  container: Container,
  unit: Unit,
  position: { x: number; y: number },
  hexSize: number,
): void {
  const barWidth = hexSize * 0.6;
  const barHeight = 5;
  const y = position.y - hexSize * 0.6;

  const background = new Graphics();
  background.rect(position.x - barWidth / 2, y, barWidth, barHeight).fill(0x000000);
  container.addChild(background);

  const ratio = Math.max(0, Math.min(1, unit.hp / MAX_HP));
  if (ratio > 0) {
    const fill = new Graphics();
    fill.rect(position.x - barWidth / 2, y, barWidth * ratio, barHeight).fill(0x00ff00);
    container.addChild(fill);
  }

  const label = new Text({
    text: `${unit.hp}/${MAX_HP}`,
    style: { fontSize: 10, fill: 0xffffff },
  });
  label.anchor.set(0.5, 1);
  label.position.set(position.x, y - 2);
  container.addChild(label);
}
```

In `renderMap`, replace the unit-sprite block (currently `textures.unitTexture`):

```ts
    if (tile.unit) {
      const unitSprite = new Sprite(textures.unitTextures[players[tile.unit.owner].tribe]);
      unitSprite.anchor.set(0.5);
      unitSprite.position.set(p.x, p.y);
      container.addChild(unitSprite);
      addHpBar(container, tile.unit, p, hexSize);
    }
```

Replace the ghost-sprite block (currently `textures.unitTexture`):

```ts
    if (reachableKeys.has(key)) {
      const ghost = new Sprite(textures.unitTextures[players[tile.unit!.owner].tribe]);
      ghost.anchor.set(0.5);
      ghost.alpha = 0.5;
      ghost.position.set(p.x, p.y);
      container.addChild(ghost);
    }
```

Note: the ghost renders only on reachable tiles, which by definition have no unit (`tile.unit` is null there) — so `players[tile.unit!.owner]` would throw. Fix by passing the selected unit's tribe into the ghost branch. Replace the ghost block with a version that uses the selected unit's owner:

```ts
    if (reachableKeys.has(key) && selection && selection.kind === 'unit') {
      const ownerTribe = players[tileAt(map, selection.q, selection.r)!.unit!.owner].tribe;
      const ghost = new Sprite(textures.unitTextures[ownerTribe]);
      ghost.anchor.set(0.5);
      ghost.alpha = 0.5;
      ghost.position.set(p.x, p.y);
      container.addChild(ghost);
    }
```

Add `tileAt` to the imports from `../game/selection`:

```ts
import { Selection, tileAt } from '../game/selection';
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 4: Verify manually with a headless screenshot**

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-h.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-h.log 2>&1 &
sleep 4
python3 - <<'EOF'
import json, requests, websocket, time, base64
BASE = "http://127.0.0.1:9222"
ws_headers = {"Origin": "http://127.0.0.1:9222"}
page = requests.put(f"{BASE}/json/new?http://localhost:5173/").json()
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10, header=ws_headers)
idc = [0]
def send(method, params=None):
    idc[0] += 1
    mid = idc[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg.get("result", {})
def evaljs(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")
send("Runtime.enable")
send("Page.enable")
time.sleep(2)
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
print("turn-info:", evaljs("document.getElementById('turn-info').textContent"))
print("selected-info:", evaljs("document.getElementById('selected-info').textContent"))
print("players-list:", evaljs("document.getElementById('players-list').textContent"))
shot = send("Page.captureScreenshot", {"format": "png"})
open("/tmp/p4rth-opencode/hud.png", "wb").write(base64.b64decode(shot["data"]))
ws.close()
EOF
convert /tmp/p4rth-opencode/hud.png -format "%c" histogram:info:- 2>/dev/null | grep -iE "8B5A2B|E07B22|C0392B|00FF00" | head -5
```

Expected: `turn-info` is `Turn 1 — <name>`; `players-list` contains names; histogram shows tribe colors and green `#00FF00` (HP bars). Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: tribe-colored units and hp bars"
```

---

## Self-Review Notes

- **Spec coverage:** names (10+10, unique, capitalized, assigned in `buildPlayers`) — Task 1; `Unit.hp` + `MAX_HP` + `UNIT_TYPE_NAMES` — Task 2; `TILE_TYPE_NAMES` — Task 3; turn counter, current player, end-turn reset, players list `name (Tribe)`, selected-info panel with omitted rows — Task 4; tribe-colored units + ghosts + always-visible HP bar+text — Task 5. All spec points covered.
- **Placeholder scan:** No TBD/TODO; every step has concrete code/commands.
- **Type consistency:** `unitTextures` used in both unit and ghost branches; `players[owner].tribe` indexing consistent; `tileAt` imported and used in the ghost branch; `MAX_HP` used in `addHpBar` and label; `generatePlayerNames`/`buildPlayers` signatures match between Task 1 and main.ts.
- **Coordinated change:** Task 4 changes `renderMap`'s `players` dependency indirectly — `renderMap` already receives `players` from Task 4's `gameScreen.ts`, and Task 5 keeps that signature. Typecheck is green after each task.
- **Ghost rendering fix:** The plan catches a subtle bug — the ghost must read the *selected* unit's tribe (`tileAt(map, selection.q, selection.r)`), not the reachable tile's unit (which is null). Addressed inline in Task 5 Step 2.
