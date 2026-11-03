# Player Resources, Village Levels & Owned Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player resources with a top-right display, village levels shown in the info card, an "Upgrade village" button with resource cost + enable/disable, village-owned cells stored on tiles, and a tribe-colored border around owned regions.

**Architecture:** Pure, testable game logic first: `resources.ts` (start values/cost/helpers), `Player.resources`, `Settlement.level` + `MapTile.ownedBy` claimed in `mapGen`, and a `village.ts` module for claim/upgrade logic. Then HUD wiring in `gameScreen.ts`/`index.html`, and finally hex edge helpers in `hex.ts` + border rendering in `mapRenderer.ts`.

**Tech Stack:** TypeScript, PixiJS 8 (Graphics), Vitest, plain HTML/CSS.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `Resources = { wood: number; stone: number; money: number }`; `START_RESOURCES = { wood: 3, stone: 2, money: 5 }`; `UPGRADE_COST = { wood: 2, stone: 1, money: 2 }`.
- `Player.resources` initialized to `START_RESOURCES`.
- `Settlement.level: number` starts at 1. `MapTile.ownedBy: number | null`.
- Owned-cell claim: level 1 → distance ≤ 1; level ≥ 2 → distance ≤ 2. Neutral villages (owner null) claim nothing. First-claim-wins.
- Ownership stored on tiles (`MapTile.ownedBy`). Upgrade currently exposed only for human's villages, but logic is generic.
- HUD: `#resources-info` (top right), level row + "Upgrade village" button in the village card.
- Border rendering: for each owned tile, draw each edge whose neighbor is not owned by the same player (or off-map), in the owner's tribe color. Layer order: terrain → village → unit → owned-border → glow → ghost.
- Tests: `npm test`; typecheck: `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Resources module + Player.resources

**Files:**
- Create: `src/game/resources.ts`
- Modify: `src/game/players.ts`
- Test: `tests/resources.test.ts` (new), `tests/players.test.ts` (add a test)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 4): `Resources`, `START_RESOURCES`, `UPGRADE_COST`, `canAfford(have, cost)`, `pay(have, cost)`, `Player.resources`.

- [ ] **Step 1: Write the failing tests**

Create `tests/resources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canAfford,
  pay,
  START_RESOURCES,
  UPGRADE_COST,
} from '../src/game/resources';

describe('resources', () => {
  it('starts with 3 wood, 2 stone, 5 money', () => {
    expect(START_RESOURCES).toEqual({ wood: 3, stone: 2, money: 5 });
  });

  it('upgrade cost is 2 wood, 1 stone, 2 money', () => {
    expect(UPGRADE_COST).toEqual({ wood: 2, stone: 1, money: 2 });
  });

  it('canAfford checks every resource', () => {
    expect(canAfford({ wood: 2, stone: 1, money: 2 }, UPGRADE_COST)).toBe(true);
    expect(canAfford({ wood: 1, stone: 1, money: 2 }, UPGRADE_COST)).toBe(false);
    expect(canAfford({ wood: 2, stone: 0, money: 2 }, UPGRADE_COST)).toBe(false);
    expect(canAfford({ wood: 2, stone: 1, money: 1 }, UPGRADE_COST)).toBe(false);
  });

  it('pay subtracts the cost', () => {
    expect(pay(START_RESOURCES, UPGRADE_COST)).toEqual({ wood: 1, stone: 1, money: 3 });
  });
});
```

Append to `tests/players.test.ts`:

```ts
  it('initializes resources to start values', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    for (const p of players) {
      expect(p.resources).toEqual({ wood: 3, stone: 2, money: 5 });
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `resources.ts` not found; `Player.resources` missing.

- [ ] **Step 3: Create `src/game/resources.ts`**

```ts
export interface Resources {
  wood: number;
  stone: number;
  money: number;
}

export const START_RESOURCES: Resources = { wood: 3, stone: 2, money: 5 };

export const UPGRADE_COST: Resources = { wood: 2, stone: 1, money: 2 };

export function canAfford(have: Resources, cost: Resources): boolean {
  return have.wood >= cost.wood && have.stone >= cost.stone && have.money >= cost.money;
}

export function pay(have: Resources, cost: Resources): Resources {
  return {
    wood: have.wood - cost.wood,
    stone: have.stone - cost.stone,
    money: have.money - cost.money,
  };
}
```

- [ ] **Step 4: Update `src/game/players.ts`**

Add the import and the field:

```ts
import { SeededRandom } from '../util/random';
import { generatePlayerNames } from './names';
import { Resources, START_RESOURCES } from './resources';
import { Tribe, TRIBES } from './tribes';

export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
}
```

Update both player constructions to include `resources: { ...START_RESOURCES }`:

```ts
  const players: Player[] = [
    { index: 0, tribe: humanTribe, isHuman: true, name: names[0], resources: { ...START_RESOURCES } },
  ];
  for (const tribe of enemyTribes) {
    players.push({
      index: players.length,
      tribe,
      isHuman: false,
      name: names[players.length],
      resources: { ...START_RESOURCES },
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/resources.ts src/game/players.ts tests/resources.test.ts tests/players.test.ts
git commit -m "feat: add player resources"
```

---

### Task 2: Village level + owned cells in mapGen

**Files:**
- Modify: `src/game/mapGen.ts`
- Modify: `tests/mapGen.test.ts`
- Modify: `tests/selection.test.ts` (literals gain `level` / `ownedBy`)

**Interfaces:**
- Consumes: `hex.ts` (`tilesInRange`, `hexDistance`), `mapGen.ts` types.
- Produces (used by Tasks 3–5): `Settlement.level: number`, `MapTile.ownedBy: number | null`, and owned cells claimed at generation.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mapGen.test.ts`:

```ts
  it('claims owned cells for owned villages, first-claim-wins', () => {
    const map = generateMap(3, 42);
    const ownedSettlements = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    expect(ownedSettlements.length).toBeGreaterThan(0);
    for (const s of ownedSettlements) {
      expect(s.ownedBy).toBe(s.settlement!.owner);
      expect(s.settlement!.level).toBe(1);
    }
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    for (const f of free) {
      expect(f.ownedBy).toBeNull();
      expect(f.settlement!.level).toBe(1);
    }
    const owned = map.tiles.filter((t) => t.ownedBy !== null);
    expect(owned.length).toBeGreaterThan(0);
    for (const t of owned) {
      const nearby = map.tiles.some(
        (s) =>
          s.settlement !== null &&
          s.settlement.owner === t.ownedBy &&
          hexDistance(s, t) <= 1,
      );
      expect(nearby).toBe(true);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `MapTile`/`Settlement` lack `ownedBy`/`level` (typecheck).

- [ ] **Step 3: Update `src/game/mapGen.ts`**

Change the interfaces:

```ts
export interface Settlement {
  owner: number | null;
  level: number;
}

export interface MapTile {
  q: number;
  r: number;
  terrain: TileType;
  settlement: Settlement | null;
  unit: Unit | null;
  ownedBy: number | null;
}
```

Update the tile-initialization loop:

```ts
  for (const t of tiles) {
    tileMap.set(axialKey(t), {
      q: t.q,
      r: t.r,
      terrain: TileType.Land,
      settlement: null,
      unit: null,
      ownedBy: null,
    });
  }
```

Update the settlement-placement loop:

```ts
  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p];
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1 };
    tileMap.get(axialKey(free))!.settlement = { owner: null, level: 1 };
  }
```

Add the claim step right after the settlement-placement loop (before the unit-placement loop). Import `tilesInRange` from `./hex` (add to the existing import):

```ts
import { allTiles, axialKey, hexDistance, hexNeighbors, hexToPixel, tilesInRange } from './hex';
```

Claim code:

```ts
  for (const tile of tileMap.values()) {
    const settlement = tile.settlement;
    if (!settlement || settlement.owner === null) continue;
    const radius = settlement.level === 1 ? 1 : 2;
    for (const t of tilesInRange(tile, radius)) {
      const target = tileMap.get(axialKey(t));
      if (target && target.ownedBy === null) {
        target.ownedBy = settlement.owner;
      }
    }
  }
```

- [ ] **Step 4: Update `tests/selection.test.ts` literals**

In `makeTile`, add `ownedBy: null`:

```ts
function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement, unit, ownedBy: null };
}
```

Update the free-village literal to include `level`:

```ts
    makeTile(1, -1, TileType.Land, { owner: null, level: 1 }),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts tests/selection.test.ts
git commit -m "feat: add village level and owned cell claiming"
```

---

### Task 3: Village upgrade logic

**Files:**
- Create: `src/game/village.ts`
- Test: `tests/village.test.ts`

**Interfaces:**
- Consumes: `hex.ts` (`hexDistance`, `axialKey`), `mapGen.ts` (`GameMap`, `MapTile`).
- Produces (used by Tasks 4–5):
  - `claimRadius(level: number): number` — 1 for level 1, 2 otherwise
  - `ownedTilesFor(map: GameMap, tile: MapTile): MapTile[]` — all tiles owned by the same player as `tile.settlement`
  - `upgradeVillage(map: GameMap, tile: MapTile): void`

- [ ] **Step 1: Write the failing test**

Create `tests/village.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { claimRadius, ownedTilesFor, upgradeVillage } from '../src/game/village';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
): MapTile {
  return { q, r, terrain: TileType.Land, settlement, unit: null, ownedBy };
}

function makeMap(): GameMap {
  const a = makeTile(0, 0, 0, { owner: 0, level: 1 });
  const b = makeTile(3, 0, 1, { owner: 1, level: 1 });
  const free = makeTile(0, 3, null, { owner: null, level: 1 });
  const empty = makeTile(2, 0, null);
  const tiles = [a, b, free, empty];
  return { radius: 5, tiles, spawns: [] };
}

describe('claimRadius', () => {
  it('maps level to radius', () => {
    expect(claimRadius(1)).toBe(1);
    expect(claimRadius(2)).toBe(2);
    expect(claimRadius(5)).toBe(2);
  });
});

describe('ownedTilesFor', () => {
  it('returns all tiles owned by the same player', () => {
    const map = makeMap();
    const a = map.tiles[0];
    expect(ownedTilesFor(map, a)).toHaveLength(1);
    expect(ownedTilesFor(map, a)[0].q).toBe(0);
  });
});

describe('upgradeVillage', () => {
  it('increments level and claims unowned tiles within radius 2', () => {
    const map = makeMap();
    const a = map.tiles[0];
    upgradeVillage(map, a);
    expect(a.settlement!.level).toBe(2);
    const owned = map.tiles.filter((t) => t.ownedBy === 0);
    expect(owned).toContain(a);
    expect(owned.some((t) => t.q === 2 && t.r === 0)).toBe(false);
    expect(map.tiles.find((t) => t.q === 3 && t.r === 0)!.ownedBy).toBe(1);
  });

  it('does nothing for a neutral village', () => {
    const map = makeMap();
    const free = map.tiles[2];
    upgradeVillage(map, free);
    expect(free.settlement!.level).toBe(1);
  });
});
```

Note: `(2,0)` is at distance 2 from `(0,0)` and distance 1 from `(3,0)` (player 1) — but in this hand-built map `(2,0)` is unclaimed, so player 0 claims it on upgrade. The assertion `owned.some((t) => t.q === 2 && t.r === 0)` being `false` would actually FAIL — correct expectation is `true`. Fix the test before running:

```ts
    expect(owned.some((t) => t.q === 2 && t.r === 0)).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `village.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/village.ts`:

```ts
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';

export function claimRadius(level: number): number {
  return level === 1 ? 1 : 2;
}

export function ownedTilesFor(map: GameMap, tile: MapTile): MapTile[] {
  const owner = tile.settlement!.owner;
  return map.tiles.filter((t) => t.ownedBy === owner);
}

export function upgradeVillage(map: GameMap, tile: MapTile): void {
  const settlement = tile.settlement;
  if (!settlement || settlement.owner === null) return;
  settlement.level++;
  const radius = claimRadius(settlement.level);
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    if (t.ownedBy === null) {
      t.ownedBy = settlement.owner;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/village.ts tests/village.test.ts
git commit -m "feat: add village upgrade logic"
```

---

### Task 4: HUD — resources display, level row, upgrade button

**Files:**
- Modify: `index.html`
- Modify: `src/screens/gameScreen.ts`
- Test: manual — headless DOM checks.

**Interfaces:**
- Consumes: `resources.ts` (`canAfford`, `pay`, `UPGRADE_COST`), `village.ts` (`upgradeVillage`), `players.ts` (`Player`), `mapGen.ts` (`GameMap`), `selection.ts` (`Selection`, `tileAt`).
- Produces: top-right resources display, village level row, and human-only "Upgrade village" button that consumes resources.

- [ ] **Step 1: Update `index.html`**

Add the resources element to the game screen and its CSS. Replace the game-screen `<div>`:

```html
  <div id="screen-game" class="screen hidden">
    <div id="game-root"></div>
    <div id="players-list"></div>
    <div id="turn-info"></div>
    <div id="resources-info"></div>
    <div id="selected-info"></div>
    <button id="end-turn-btn">End turn</button>
  </div>
```

Add the CSS rule (after the `#turn-info` rule):

```css
    #resources-info { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
```

- [ ] **Step 2: Update `src/screens/gameScreen.ts`**

Add imports:

```ts
import { canAfford, pay, UPGRADE_COST } from '../game/resources';
import { upgradeVillage } from '../game/village';
```

Replace the `selectedInfoHtml` village branch to include a level row and, for the human's village, an upgrade button. Replace the whole function:

```ts
function selectedInfoHtml(
  players: Player[],
  map: GameMap,
  selection: Selection | null,
  onUpgrade: (() => void) | null,
): string {
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
    lines.push(`<div>Level: ${tile.settlement!.level}</div>`);
    const owner = tile.settlement!.owner;
    if (owner !== null) {
      const player = players[owner];
      lines.push(`<div>Tribe: ${tribeName(player)}</div>`);
      lines.push(`<div>Player: ${player.name}</div>`);
      if (owner === 0 && onUpgrade) {
        const affordable = canAfford(players[0].resources, UPGRADE_COST);
        lines.push(
          `<button id="upgrade-village-btn" ${affordable ? '' : 'disabled'}>Upgrade village</button>`,
        );
      }
    }
  } else {
    lines.push(`<div>Name: ${TILE_TYPE_NAMES[tile.terrain]}</div>`);
    lines.push(`<div>Type: terrain</div>`);
  }
  return lines.join('');
}
```

Inside `initGameScreen`, replace the `updateHud` function and add the upgrade handler. Replace:

```ts
  const updateHud = (): void => {
    turnInfoEl.textContent = `Turn ${turn} — ${currentPlayer.name}`;
    selectedInfoEl.innerHTML = selectedInfoHtml(players, map, selection);
  };
```

with:

```ts
  const resourcesInfoEl = document.getElementById('resources-info')!;

  const handleUpgrade = (): void => {
    if (!selection || selection.kind !== 'village') return;
    const tile = tileAt(map, selection.q, selection.r)!;
    if (!tile.settlement || tile.settlement.owner !== 0) return;
    if (!canAfford(players[0].resources, UPGRADE_COST)) return;
    players[0].resources = pay(players[0].resources, UPGRADE_COST);
    upgradeVillage(map, tile);
    render();
  };

  const updateHud = (): void => {
    const human = players[0];
    turnInfoEl.textContent = `Turn ${turn} — ${currentPlayer.name}`;
    resourcesInfoEl.textContent = `Wood: ${human.resources.wood} Stone: ${human.resources.stone} Money: ${human.resources.money}`;
    selectedInfoEl.innerHTML = selectedInfoHtml(players, map, selection, () => handleUpgrade());
    const upgradeBtn = document.getElementById('upgrade-village-btn');
    if (upgradeBtn) upgradeBtn.addEventListener('click', handleUpgrade);
  };
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify manually via headless DOM checks**

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-r.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-r.log 2>&1 &
sleep 4
python3 - <<'EOF'
import json, requests, websocket, time, math
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
time.sleep(2)
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
print("resources:", evaljs("document.getElementById('resources-info').textContent"))
ws.close()
EOF
```

Expected: `resources-info` shows `Wood: 3 Stone: 2 Money: 5`. Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add index.html src/screens/gameScreen.ts
git commit -m "feat: add resources hud, village level, upgrade button"
```

---

### Task 5: Owned-cell border rendering

**Files:**
- Modify: `src/game/hex.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: `tests/hex.test.ts` (hex edge helper), manual screenshot for border.

**Interfaces:**
- Consumes: `hex.ts` (`hexToPixel`), `mapGen.ts` (`MapTile`), `players.ts` (`Player`).
- Produces: `hexEdge(h, edge, hexSize)` + `hexEdgeNeighbor(h, edge)`; border drawn around owned regions.

- [ ] **Step 1: Write the failing test**

Append to `tests/hex.test.ts`:

```ts
import { hexEdge, hexEdgeNeighbor } from '../src/game/hex';
```

Add:

```ts
  it('hexEdge returns two distinct endpoints and hexEdgeNeighbor gives a distinct tile', () => {
    const h = { q: 0, r: 0 };
    for (let e = 0; e < 6; e++) {
      const seg = hexEdge(h, e, 40);
      const samePoint = seg.ax === seg.bx && seg.ay === seg.by;
      expect(samePoint).toBe(false);
      const n = hexEdgeNeighbor(h, e);
      expect(n.q !== 0 || n.r !== 0).toBe(true);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `hexEdge`/`hexEdgeNeighbor` not exported.

- [ ] **Step 3: Add hex edge helpers to `src/game/hex.ts`**

Append to the end of the file:

```ts
export interface EdgeSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function hexCorner(h: Axial, corner: number, hexSize: number): { x: number; y: number } {
  const angle = (Math.PI / 3) * corner - Math.PI / 6;
  const p = hexToPixel(h, hexSize);
  return { x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) };
}

export function hexEdge(h: Axial, edge: number, hexSize: number): EdgeSegment {
  const a = hexCorner(h, edge, hexSize);
  const b = hexCorner(h, (edge + 1) % 6, hexSize);
  return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
}

export function hexEdgeNeighbor(h: Axial, edge: number): Axial {
  const dir = NEIGHBOR_DIRECTIONS[edge];
  return { q: h.q + dir.q, r: h.r + dir.r };
}
```

- [ ] **Step 4: Update `src/render/mapRenderer.ts`**

Add imports:

```ts
import { axialKey, hexEdge, hexEdgeNeighbor, hexToPixel } from '../game/hex';
```

Add a helper function before `renderMap`:

```ts
function drawOwnedBorders(
  container: Container,
  map: GameMap,
  players: Player[],
  textures: TextureSet,
  hexSize: number,
): void {
  const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
  for (const tile of map.tiles) {
    if (tile.ownedBy === null) continue;
    const color = textures.glowTextures.byTribe[players[tile.ownedBy].tribe];
    const border = new Graphics();
    for (let e = 0; e < 6; e++) {
      const neighbor = byKey.get(axialKey(hexEdgeNeighbor(tile, e)));
      if (neighbor && neighbor.ownedBy === tile.ownedBy) continue;
      const seg = hexEdge(tile, e, hexSize);
      border.moveTo(seg.ax, seg.ay).lineTo(seg.bx, seg.by);
    }
    border.stroke({ width: 4, color });
    container.addChild(border);
  }
}
```

In `renderMap`, call `drawOwnedBorders` right after the tile loop (before `return container;`):

```ts
  drawOwnedBorders(container, map, players, textures, hexSize);

  return container;
```

Note: `Graphics.stroke` applies to all paths drawn on that Graphics object; using one Graphics per tile keeps the color correct per tile. The color comes from `textures.glowTextures.byTribe` (a solid tribe-color blurred circle texture, but we only need its `color`? No — that's a Texture). The border must use the tribe's raw color, so import `TRIBES` instead:

Replace the color line:

```ts
    const tribe = TRIBES.find((t) => t.id === players[tile.ownedBy].tribe)!;
    const color = tribe.color;
```

And add `import { TRIBES } from '../game/tribes';`.

- [ ] **Step 5: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify manually with a screenshot**

Run the dev server + Chrome, click through to the game screen, take a screenshot, and confirm tribe-colored edge segments are present:

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-b.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-b.log 2>&1 &
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
shot = send("Page.captureScreenshot", {"format": "png"})
open("/tmp/p4rth-opencode/border.png", "wb").write(base64.b64decode(shot["data"]))
ws.close()
EOF
convert /tmp/p4rth-opencode/border.png -format "%c" histogram:info:- 2>/dev/null | grep -iE "8B5A2B|E07B22|C0392B" | head -5
```

Expected: tribe colors present in larger counts than units alone (borders added). Kill the dev server and Chrome afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/game/hex.ts src/render/mapRenderer.ts tests/hex.test.ts
git commit -m "feat: draw owned cell borders in tribe color"
```

---

## Self-Review Notes

- **Spec coverage:** resources start/cost/helpers + `Player.resources` — Task 1; `Settlement.level`/`MapTile.ownedBy` + first-claim-wins claiming at generation — Task 2; `claimRadius`/`ownedTilesFor`/`upgradeVillage` — Task 3; `#resources-info`, level row, upgrade button with enable/disable and cost deduction — Task 4; hex edge helpers + tribe-colored external-border rendering — Task 5. All spec points covered.
- **Placeholder scan:** No TBD/TODO; every step has concrete code.
- **Type consistency:** `ownedBy`, `level`, `Resources`, `canAfford`, `pay`, `UPGRADE_COST`, `upgradeVillage`, `hexEdge`, `hexEdgeNeighbor` used consistently across tasks. `selectedInfoHtml` signature updated to take `onUpgrade` in Task 4 and used only there.
- **Deliberate test fix:** Task 3's initial test snippet had an inverted expectation for the `(2,0)` claim; the plan explicitly calls it out and fixes it before running. Task 2's "nearby" assertion uses `hexDistance` (Manhattan distance is wrong for hex neighbors).
- **Rendering nuance:** The plan corrects a mistake — the border color must come from `TRIBES` (raw color), not `glowTextures` (which holds textures, not colors). Addressed inline in Task 5 Step 4.
