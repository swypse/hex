# Territory Stealing, Village Spacing, Map Size, Money Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let player villages steal free-village territory (except the free village's own tile) at generation and on expansion; enforce minimum distance 2 between all villages; keep starting villages ≥ 2 from the map edge with a larger map; move resources into the top-center money block and remove the top-right panel.

**Architecture:** A shared claim rule in `src/game/claim.ts` used by both `mapGen` and `village.upgradeVillage` — player claims win over free claims (never the free village's own tile), and player-vs-player stays first-claim-wins. `mapRadiusFor` grows to 6/7; start candidates are filtered by distance-from-center. `MoneyInfo` gains wood/stone with colored squares; `ResourcesInfo` is deleted.

**Tech Stack:** TypeScript, React 18, zustand, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `mapRadiusFor`: 2 players → 6, 3 players → 7 (throws otherwise).
- Start candidates: `hexDistance(center, tile) <= radius - 2`.
- All villages pairwise distance ≥ 2.
- Claim rule (shared): unclaimed → claim; free-claimed and not the free village's own tile → steal; other player's claim → leave; free village's own tile never stolen by claim/expansion.
- Money block under `#turn-info`: `⭐ {money} [brown square] Wood: {wood} [gray square] Stone: {stone}` (brown `#8b5a2b`, gray `#9a9a9a`).
- Remove `#resources-info` panel/CSS and `ResourcesInfo` component.
- Tests: `npm test`; typecheck `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Map radius, edge rule, village spacing

**Files:**
- Modify: `src/game/mapGen.ts`
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: `hex.ts` (`hexDistance`), `mapGen.ts` types.
- Produces: `mapRadiusFor(2)=6`, `mapRadiusFor(3)=7`; start candidates constrained to `distance <= radius - 2`; all settlements pairwise distance ≥ 2.

- [ ] **Step 1: Write the failing tests**

Update the radius test in `tests/mapGen.test.ts`:

```ts
  it('chooses radius by player count', () => {
    expect(mapRadiusFor(2)).toBe(6);
    expect(mapRadiusFor(3)).toBe(7);
    expect(() => mapRadiusFor(1)).toThrow();
    expect(() => mapRadiusFor(4)).toThrow();
  });
```

Update the tile-count test:

```ts
  it('generates the expected number of tiles', () => {
    const map = generateMap(2, 42);
    expect(map.tiles).toHaveLength(allTiles(6).length);
  });
```

Append new tests:

```ts
  it('keeps starting villages at least 2 tiles from the map edge', () => {
    const map = generateMap(2, 42);
    for (const s of map.spawns) {
      expect(hexDistance({ q: 0, r: 0 }, s.start)).toBeLessThanOrEqual(map.radius - 2);
    }
  });

  it('keeps all villages at pairwise distance >= 2', () => {
    const map = generateMap(3, 42);
    const villages = map.tiles.filter((t) => t.settlement !== null);
    for (let i = 0; i < villages.length; i++) {
      for (let j = i + 1; j < villages.length; j++) {
        expect(hexDistance(villages[i], villages[j])).toBeGreaterThanOrEqual(2);
      }
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — radius is still 4/5.

- [ ] **Step 3: Update `src/game/mapGen.ts`**

Change `mapRadiusFor`:

```ts
export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return 6;
  if (playerCount === 3) return 7;
  throw new Error(`Unsupported player count: ${playerCount}`);
}
```

Change the settlement placement loop to constrain start candidates by distance from center and enforce spacing against all already-placed villages:

```ts
  const reserved = new Set<string>();
  const spawns: Spawn[] = [];
  const placedVillages: { q: number; r: number }[] = [];

  const isTooCloseToAnyVillage = (t: { q: number; r: number }): boolean =>
    placedVillages.some((v) => hexDistance(t, v) < 2);

  for (let p = 0; p < playerCount; p++) {
    const target = sectorCenterAngle(p, playerCount);
    const inSector = tiles.filter(
      (t) =>
        angleDiff(angleOf(t), target) < Math.PI / playerCount &&
        !(t.q === 0 && t.r === 0) &&
        hexDistance({ q: 0, r: 0 }, t) <= radius - 2,
    );
    let candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const start = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(start)) reserved.add(axialKey(n));
    placedVillages.push(start);

    candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const free = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(free)) reserved.add(axialKey(n));
    placedVillages.push(free);

    spawns.push({ start, free });
  }
```

Note: the `free` village is no longer constrained to `distance >= 2` from its own start explicitly — the `isTooCloseToAnyVillage` check (distance < 2) covers it. The `reserved` set (neighbors of placed villages) also prevents adjacency.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: grow map and enforce village edge and spacing rules"
```

---

### Task 2: Shared territory claim rule (steal from free villages)

**Files:**
- Create: `src/game/claim.ts`
- Modify: `src/game/mapGen.ts`, `src/game/village.ts`
- Test: `tests/claim.test.ts` (new), `tests/mapGen.test.ts`, `tests/village.test.ts`

**Interfaces:**
- Consumes: `mapGen.ts` (`GameMap`, `MapTile`).
- Produces:
  - `claimTileForVillage(target: MapTile, claimingVillage: MapTile): void` — applies the claim rule (unclaimed → claim; free-claimed and not free's own tile → steal; else leave).

- [ ] **Step 1: Write the failing test**

Create `tests/claim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { claimTileForVillage } from '../src/game/claim';

function tile(q: number, r: number, ownedBy: number | null, claimedByVillage: { q: number; r: number } | null): MapTile {
  return { q, r, terrain: TileType.Land, settlement: null, unit: null, ownedBy, claimedByVillage };
}

describe('claimTileForVillage', () => {
  it('claims an unclaimed tile', () => {
    const target = tile(1, 0, null, null);
    claimTileForVillage(target, tile(0, 0, 0, { q: 0, r: 0 }));
    expect(target.ownedBy).toBe(0);
    expect(target.claimedByVillage).toEqual({ q: 0, r: 0 });
  });

  it('steals a free village tile (not the free village itself)', () => {
    const freeCell = tile(1, 0, null, { q: 2, r: 0 });
    claimTileForVillage(freeCell, tile(0, 0, 0, { q: 0, r: 0 }));
    expect(freeCell.ownedBy).toBe(0);
    expect(freeCell.claimedByVillage).toEqual({ q: 0, r: 0 });
  });

  it('does not steal the free village own tile', () => {
    const freeVillageTile = tile(2, 0, null, { q: 2, r: 0 });
    claimTileForVillage(freeVillageTile, tile(0, 0, 0, { q: 0, r: 0 }));
    expect(freeVillageTile.ownedBy).toBeNull();
    expect(freeVillageTile.claimedByVillage).toEqual({ q: 2, r: 0 });
  });

  it('does not steal another players territory', () => {
    const other = tile(1, 0, 3, { q: 9, r: 9 });
    claimTileForVillage(other, tile(0, 0, 0, { q: 0, r: 0 }));
    expect(other.ownedBy).toBe(3);
  });
});
```

Note: "free village own tile" is identified by `claimedByVillage` matching the target tile's own coordinates (`target.q === target.claimedByVillage.q && target.r === target.claimedByVillage.r`). Update the test's free-village-tile fixture accordingly:

```ts
  it('does not steal the free village own tile', () => {
    const freeVillageTile = tile(2, 0, null, { q: 2, r: 0 });
    claimTileForVillage(freeVillageTile, tile(0, 0, 0, { q: 0, r: 0 }));
    expect(freeVillageTile.ownedBy).toBeNull();
    expect(freeVillageTile.claimedByVillage).toEqual({ q: 2, r: 0 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `claim.ts` not found.

- [ ] **Step 3: Create `src/game/claim.ts`**

```ts
import { MapTile } from './mapGen';

export function claimTileForVillage(target: MapTile, claimingVillage: MapTile): void {
  const claimed = target.claimedByVillage;
  if (claimed === null) {
    target.claimedByVillage = { q: claimingVillage.q, r: claimingVillage.r };
    if (claimingVillage.settlement && claimingVillage.settlement.owner !== null) {
      target.ownedBy = claimingVillage.settlement.owner;
    }
    return;
  }

  const targetIsFreeVillageTile =
    claimed.q === target.q && claimed.r === target.r && target.ownedBy === null;
  if (targetIsFreeVillageTile) return;

  const claimingSettlement = claimingVillage.settlement;
  if (!claimingSettlement || claimingSettlement.owner === null) return;
  if (target.ownedBy === null) {
    target.ownedBy = claimingSettlement.owner;
    target.claimedByVillage = { q: claimingVillage.q, r: claimingVillage.r };
  }
}
```

- [ ] **Step 4: Update `src/game/mapGen.ts` to use the shared rule**

Import `claimTileForVillage` and replace the generation claim loop body:

```ts
import { claimTileForVillage } from './claim';
```

```ts
  for (const tile of tileMap.values()) {
    const settlement = tile.settlement;
    if (!settlement) continue;
    const radius = settlement.level === 1 ? 1 : 2;
    for (const t of tilesInRange(tile, radius)) {
      const target = tileMap.get(axialKey(t));
      if (target) {
        claimTileForVillage(target, tile);
      }
    }
  }
```

- [ ] **Step 5: Update `src/game/village.ts` to use the shared rule**

Add the import and replace the upgrade claim loop:

```ts
import { claimTileForVillage } from './claim';
```

```ts
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    claimTileForVillage(t, tile);
  }
```

- [ ] **Step 6: Update existing mapGen/village tests**

In `tests/mapGen.test.ts`, the "free villages claim their radius-1 territory with ownedBy null" test still passes (free claims set `claimedByVillage` only). The "claims owned cells for owned villages" test asserts `owned.length > 0` — still true.

In `tests/village.test.ts`, the `upgradeVillage` test "increments level and claims unowned tiles within radius 2" — verify `(2,0)` is claimed (it is unclaimed) and `(3,0)` (player 1's tile) is untouched. These should still pass.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/claim.ts src/game/mapGen.ts src/game/village.ts tests/claim.test.ts
git commit -m "feat: player villages steal free village territory"
```

---

### Task 3: Move resources into the money block

**Files:**
- Modify: `src/screens/hud/MoneyInfo.tsx`, `src/screens/GameScreen.tsx`
- Delete: `src/screens/hud/ResourcesInfo.tsx`
- Modify: `index.html` (remove `#resources-info` CSS)
- Test: manual.

**Interfaces:**
- Consumes: store `players`, `currentPlayerIndex`.
- Produces: `#money-info` shows `⭐ {money}` plus wood/stone with colored squares; `ResourcesInfo` removed.

- [ ] **Step 1: Rewrite `src/screens/hud/MoneyInfo.tsx`**

Replace the render with wood/stone squares:

```tsx
export function MoneyInfo(): React.ReactElement {
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  const money = player?.resources.money ?? 0;
  const wood = player?.resources.wood ?? 0;
  const stone = player?.resources.stone ?? 0;
  const [display, setDisplay] = useState(money);
  const [bounce, setBounce] = useState(0);
  const displayedRef = useRef(money);

  useEffect(() => {
    displayedRef.current = display;
  }, [display]);

  useEffect(() => {
    let cancelled = false;
    const step = (): void => {
      if (cancelled) return;
      const current = displayedRef.current;
      if (current < money) {
        displayedRef.current = current + 1;
        setDisplay(current + 1);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      } else if (current > money) {
        displayedRef.current = current - 1;
        setDisplay(current - 1);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      }
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [money]);

  const squareStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 10,
    height: 10,
    marginLeft: 8,
  };

  return (
    <div id="money-info">
      <span key={bounce} className={bounce > 0 ? 'money-bounce' : ''}>⭐ {display}</span>
      <span style={{ ...squareStyle, background: '#8b5a2b' }} />
      <span>Wood: {wood}</span>
      <span style={{ ...squareStyle, background: '#9a9a9a' }} />
      <span>Stone: {stone}</span>
    </div>
  );
}
```

- [ ] **Step 2: Remove `ResourcesInfo` from `GameScreen.tsx`**

Delete the import and the `<ResourcesInfo />` element:

```tsx
import { TurnInfo } from './hud/TurnInfo';
import { MoneyInfo } from './hud/MoneyInfo';
```

```tsx
      <TurnInfo />
      <MoneyInfo />
```

- [ ] **Step 3: Delete `src/screens/hud/ResourcesInfo.tsx`**

```bash
git rm src/screens/hud/ResourcesInfo.tsx
```

- [ ] **Step 4: Remove `#resources-info` CSS from `index.html`**

Delete the rule:

```css
    #resources-info { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run `npm run dev` + Chrome; start a game. Confirm top-center under `#turn-info` shows `⭐ {money}` plus brown square `Wood: N` and gray square `Stone: N`, and the top-right `#resources-info` is gone. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add src/screens/hud/MoneyInfo.tsx src/screens/GameScreen.tsx index.html
git rm src/screens/hud/ResourcesInfo.tsx
git commit -m "feat: show wood and stone in the money block"
```

---

## Self-Review Notes

- **Spec coverage:** radius 6/7 + edge rule — Task 1; pairwise spacing ≥ 2 — Task 1; steal-free-village-claim (except free village tile) at generation and on expansion — Task 2; money block with wood/stone squares + remove top-right panel — Task 3. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `claimTileForVillage`, `claimedByVillage`, `ownedBy`, `mapRadiusFor` names consistent across tasks. `claim.ts` is the single source of the claim rule used by both `mapGen` and `village`.
- **Free-village-tile guard:** a cell is the free village's own tile when `claimedByVillage` equals its own coords AND `ownedBy === null`; `claimTileForVillage` returns early in that case. The test fixtures use this rule.
- **Coordinate change:** the radius change affects tests that assume radius 4/5 (`allTiles(4)`, `mapRadiusFor(2)`) — updated in Task 1.
