# Village Sprites Over Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Villages are visible on the map as black circle sprites drawn on top of their terrain tile, so the terrain stays visible underneath.

**Architecture:** Split the settlement flag out of the tile type. `MapTile` becomes `{ q, r, terrain, settlement }` — `terrain` always holds a real terrain type, `settlement` is `null` or `{ owner: number | null }`. mapGen assigns terrain to every tile (settlement tiles get land-ish terrain) and attaches `settlement`. The renderer draws the terrain hex for every tile and overlays a black circle sprite when `settlement` is present.

**Tech Stack:** TypeScript, PixiJS 8, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `MapTile` = `{ q: number; r: number; terrain: TileType; settlement: Settlement | null }` with `interface Settlement { owner: number | null }`.
- `terrain` is never `TileType.Settlement`.
- `settlement: null` = no village; `{ owner: null }` = free village; `{ owner: n }` = owned by player `n`.
- Settlement tiles' terrain comes from `TERRAIN_TYPES` (never water/mountain).
- `renderMap` final signature: `renderMap(app: Application, map: GameMap, textures: TextureSet, hexSize?: number): Container` (no `players` param).
- Tests run with `npm test`; typecheck with `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Split terrain from settlement in the model

**Files:**
- Modify: `src/game/mapGen.ts`
- Modify: `src/render/mapRenderer.ts` (render terrain only; keeps `players` param, unused for now)
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: existing `hex.ts`, `tileTypes.ts` (`TileType`, `TERRAIN_TYPES`, `WEIGHTED_TERRAIN`), `random.ts`.
- Produces (consumed by Task 2):
  - `interface Settlement { owner: number | null }`
  - `interface MapTile { q: number; r: number; terrain: TileType; settlement: Settlement | null }`
  - `generateMap(playerCount, seed): GameMap` unchanged signature, new tile shape.
- Note: `textureFactory.ts` and `gameScreen.ts` are NOT touched in this task — `renderMap` keeps its `players` parameter so the game screen compiles unchanged.

- [ ] **Step 1: Update the mapGen tests to the new model**

Replace the contents of `tests/mapGen.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { allTiles, axialKey, hexDistance, hexNeighbors } from '../src/game/hex';
import { generateMap, mapRadiusFor } from '../src/game/mapGen';
import { TERRAIN_TYPES, TileType } from '../src/game/tileTypes';

describe('map generation', () => {
  it('chooses radius by player count', () => {
    expect(mapRadiusFor(2)).toBe(4);
    expect(mapRadiusFor(3)).toBe(5);
    expect(() => mapRadiusFor(1)).toThrow();
    expect(() => mapRadiusFor(4)).toThrow();
  });

  it('generates the expected number of tiles', () => {
    const map = generateMap(2, 42);
    expect(map.tiles).toHaveLength(allTiles(4).length);
  });

  it('is deterministic for a fixed seed', () => {
    expect(generateMap(2, 42).tiles).toEqual(generateMap(2, 42).tiles);
  });

  it('places one owned settlement per player and one free settlement per player', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned).toHaveLength(2);
    expect(free).toHaveLength(2);
    expect(new Set(owned.map((t) => t.settlement!.owner))).toEqual(new Set([0, 1]));
  });

  it('has no settlement adjacent to another settlement', () => {
    const map = generateMap(3, 42);
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    for (const s of settlements) {
      for (const n of hexNeighbors(s)) {
        const neighbor = byKey.get(axialKey(n));
        if (neighbor) {
          expect(neighbor.settlement).toBeNull();
        }
      }
    }
  });

  it('pairs each player with a free village at distance >= 2', () => {
    const map = generateMap(3, 42);
    expect(map.spawns).toHaveLength(3);
    for (const s of map.spawns) {
      expect(hexDistance(s.start, s.free)).toBeGreaterThanOrEqual(2);
    }
  });

  it('never places a settlement on the map center tile', () => {
    const map = generateMap(3, 42);
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0);
    expect(center?.settlement).toBeNull();
  });

  it('keeps a land-ish terrain type under every settlement', () => {
    const map = generateMap(3, 42);
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    expect(settlements.length).toBeGreaterThan(0);
    for (const s of settlements) {
      expect(TERRAIN_TYPES).toContain(s.terrain);
      expect(s.terrain).not.toBe(TileType.Settlement);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `mapGen.ts` still uses the old shape; tests reference `t.settlement` which does not exist yet.

- [ ] **Step 3: Update `src/game/mapGen.ts`**

Replace the entire file contents with:

```ts
import { allTiles, axialKey, hexDistance, hexNeighbors, hexToPixel } from './hex';
import { TERRAIN_TYPES, TileType, WEIGHTED_TERRAIN } from './tileTypes';
import { SeededRandom } from '../util/random';

export interface Settlement {
  owner: number | null;
}

export interface MapTile {
  q: number;
  r: number;
  terrain: TileType;
  settlement: Settlement | null;
}

export interface Spawn {
  start: { q: number; r: number };
  free: { q: number; r: number };
}

export interface GameMap {
  radius: number;
  tiles: MapTile[];
  spawns: Spawn[];
}

export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return 4;
  if (playerCount === 3) return 5;
  throw new Error(`Unsupported player count: ${playerCount}`);
}

function angleOf(tile: { q: number; r: number }): number {
  const p = hexToPixel(tile, 1);
  return Math.atan2(p.y, p.x);
}

function sectorCenterAngle(sector: number, playerCount: number): number {
  return ((sector + 0.5) / playerCount) * 2 * Math.PI - Math.PI;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 2 * Math.PI - d);
}

function nearestToCenterline(
  candidates: { q: number; r: number }[],
  target: number,
): { q: number; r: number } {
  let best: { q: number; r: number } | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = angleDiff(angleOf(c), target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  if (!best) throw new Error('No candidate tile for settlement');
  return best;
}

export function generateMap(playerCount: number, seed: number): GameMap {
  const radius = mapRadiusFor(playerCount);
  const rng = new SeededRandom(seed);
  const tiles = allTiles(radius);
  const tileMap = new Map<string, MapTile>();
  for (const t of tiles) {
    tileMap.set(axialKey(t), { q: t.q, r: t.r, terrain: TileType.Land, settlement: null });
  }

  const reserved = new Set<string>();
  const spawns: Spawn[] = [];

  for (let p = 0; p < playerCount; p++) {
    const target = sectorCenterAngle(p, playerCount);
    const inSector = tiles.filter(
      (t) => angleDiff(angleOf(t), target) < Math.PI / playerCount && !(t.q === 0 && t.r === 0),
    );
    let candidates = inSector.filter((t) => !reserved.has(axialKey(t)));
    const start = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(start)) reserved.add(axialKey(n));

    candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && hexDistance(t, start) >= 2,
    );
    const free = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(free)) reserved.add(axialKey(n));

    spawns.push({ start, free });
  }

  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p];
    tileMap.get(axialKey(start))!.settlement = { owner: p };
    tileMap.get(axialKey(free))!.settlement = { owner: null };
  }

  for (const tile of tileMap.values()) {
    if (tile.settlement) {
      tile.terrain = rng.pick(TERRAIN_TYPES);
    } else {
      tile.terrain = reserved.has(axialKey(tile))
        ? rng.pick(TERRAIN_TYPES)
        : rng.pick(WEIGHTED_TERRAIN);
    }
  }

  return { radius, tiles: [...tileMap.values()], spawns };
}
```

- [ ] **Step 4: Update `src/render/mapRenderer.ts` to render terrain only**

Replace the entire file contents with (keeps the `players` parameter so `gameScreen.ts` compiles; it is removed in Task 2):

```ts
import { Application, Container, Sprite } from 'pixi.js';
import { hexToPixel } from '../game/hex';
import { GameMap } from '../game/mapGen';
import { Player } from '../game/players';
import { TextureSet } from './textureFactory';

export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  hexSize = 40,
): Container {
  const container = new Container();
  container.position.set(app.screen.width / 2, app.screen.height / 2);

  for (const tile of map.tiles) {
    const sprite = new Sprite(textures.tileTextures[tile.terrain]);
    const p = hexToPixel(tile, hexSize);
    sprite.anchor.set(0.5);
    sprite.position.set(p.x, p.y);
    container.addChild(sprite);
  }

  return container;
}
```

- [ ] **Step 5: Run tests and typecheck to verify they pass**

Run: `npm test`
Expected: PASS (all 27 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapGen.ts src/render/mapRenderer.ts tests/mapGen.test.ts
git commit -m "refactor: split terrain from settlement in map model"
```

---

### Task 2: Draw the village (black circle) over the terrain

**Files:**
- Modify: `src/render/textureFactory.ts` (add `villageTexture`, remove `tribeTextures`/`neutralSettlementTexture`)
- Modify: `src/render/mapRenderer.ts` (drop `players` param, overlay circle on settlements)
- Modify: `src/screens/gameScreen.ts` (update `renderMap` call)
- Test: manual — headless screenshot before/after, black-pixel count increases.

**Interfaces:**
- Consumes: Task 1's `MapTile.settlement`, `TextureSet`.
- Produces:
  - `interface TextureSet { tileTextures: Record<TileType, Texture>; villageTexture: Texture }`
  - `renderMap(app, map, textures, hexSize?)` — no `players` param.
  - `initGameScreen` calls `renderMap(app, map, textures)`.

- [ ] **Step 1: Write `src/render/textureFactory.ts`**

Replace the entire file contents with:

```ts
import { Application, Graphics, Texture } from 'pixi.js';
import { TileType, TILE_TYPE_COLORS } from '../game/tileTypes';

export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTexture: Texture;
}

function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle));
  }
  return points;
}

function makeHexTexture(app: Application, fill: number, hexSize: number): Texture {
  const g = new Graphics();
  g.poly(hexagonPoints(hexSize)).fill(fill);
  g.stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

function makeVillageTexture(app: Application, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.3).fill(0x000000);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

export function createTextures(app: Application, hexSize = 40): TextureSet {
  const tileTextures = {} as Record<TileType, Texture>;
  for (const type of Object.keys(TILE_TYPE_COLORS) as unknown as TileType[]) {
    tileTextures[type] = makeHexTexture(app, TILE_TYPE_COLORS[type], hexSize);
  }
  return {
    tileTextures,
    villageTexture: makeVillageTexture(app, hexSize),
  };
}
```

- [ ] **Step 2: Rewrite `src/render/mapRenderer.ts`**

Replace the entire file contents with:

```ts
import { Application, Container, Sprite } from 'pixi.js';
import { hexToPixel } from '../game/hex';
import { GameMap } from '../game/mapGen';
import { TextureSet } from './textureFactory';

export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  hexSize = 40,
): Container {
  const container = new Container();
  container.position.set(app.screen.width / 2, app.screen.height / 2);

  for (const tile of map.tiles) {
    const p = hexToPixel(tile, hexSize);

    const terrainSprite = new Sprite(textures.tileTextures[tile.terrain]);
    terrainSprite.anchor.set(0.5);
    terrainSprite.position.set(p.x, p.y);
    container.addChild(terrainSprite);

    if (tile.settlement) {
      const villageSprite = new Sprite(textures.villageTexture);
      villageSprite.anchor.set(0.5);
      villageSprite.position.set(p.x, p.y);
      container.addChild(villageSprite);
    }
  }

  return container;
}
```

- [ ] **Step 3: Update `src/screens/gameScreen.ts`**

Replace line 23:

```ts
  app.stage.addChild(renderMap(app, map, textures, players));
```

with:

```ts
  app.stage.addChild(renderMap(app, map, textures));
```

No other changes to this file.

- [ ] **Step 4: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 5: Capture a baseline screenshot (before rendering the circle)**

Run the dev server and capture the game screen with a headless browser, then count black pixels. Use seed-independent flow: navigate start → setup (2 enemies) → game.

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-village.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-village.log 2>&1 &
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
evaljs("document.querySelectorAll('#enemy-select button')[1].click()")
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
shot = send("Page.captureScreenshot", {"format": "png"})
open("/tmp/p4rth-opencode/village-before.png", "wb").write(base64.b64decode(shot["data"]))
ws.close()
EOF
convert /tmp/p4rth-opencode/village-before.png -format "%c" histogram:info:- 2>/dev/null | grep -E "#000000" | head -1
```

Record the black-pixel count printed for `#000000` as the baseline.

- [ ] **Step 6: Rebuild is live — capture the after screenshot and compare**

Run the same Python script again (the dev server already reflects the new code via HMR), saving to `/tmp/p4rth-opencode/village-after.png`, and run the same `convert` command.

Expected: the `#000000` pixel count in the after screenshot is at least 1000 higher than the baseline (each village circle of radius ~12px adds ~450 black pixels; with 6 villages the increase is ~2700).

If the increase is not present, stop and investigate before committing.

- [ ] **Step 7: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts src/screens/gameScreen.ts
git commit -m "feat: draw village sprite over terrain"
```

---

## Self-Review Notes

- **Spec coverage:** Model change (`terrain` + `settlement`) — Task 1. mapGen terrain for all tiles, settlement tiles use `TERRAIN_TYPES` — Task 1. Renderer draws terrain + black circle overlay — Tasks 1–2. `TextureSet` drops tribe/neutral textures, adds `villageTexture` — Task 2. `renderMap` drops `players` param — Task 2. Tests updated to `settlement` — Task 1. New assertion "every settlement keeps a real terrain type" — Task 1. All spec points covered.
- **Placeholder scan:** No TBD/TODO; every step has concrete code or commands.
- **Type consistency:** `Settlement`/`MapTile` names match across both tasks. `TextureSet` is redefined fully in Task 2 so no stale fields leak. `renderMap` keeps `players` in Task 1 (used only to keep `gameScreen.ts` compiling) and drops it in Task 2 — `gameScreen.ts` is updated in the same Task 2 step so nothing references the old signature. `tile.terrain` is the renderer key in both tasks.
