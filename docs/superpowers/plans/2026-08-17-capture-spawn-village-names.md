# Capture/Spawn Rules, HP Z-Order, Village Names, Selected Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable a capturer after capturing, make spawned units idle until the next round, allow unlimited spawns on empty village tiles, draw HP bars above borders, add generated village names, and enrich the selected-info panel.

**Architecture:** Set terminal action flags in `captureVillage` and `spawnUnit`; remove the spawn capacity gate in `spawnUnit`, `ai.ts`, and the spawn UI; defer HP-bar drawing until after borders in `mapRenderer`; add village name dicts + generator and assign names at map generation; rewrite `SelectedInfo` to show kind-specific details.

**Tech Stack:** TypeScript, PixiJS v8, React, Vitest.

## Global Constraints

- `Settlement.name?: string` (optional; `mapGen` always assigns one).
- Spawned units and capture recipients get all four action flags set (`hasMoved`/`hasAttacked`/`hasHealed`/`hasCollected`).
- Spawning is gated only by the village tile being empty (and affordability); capacity gates only `villageIncome`.
- Village label text is `"Name N/M"` (name trimmed/omitted when absent).
- No new npm dependencies; no code comments.
- Typecheck: `npm run typecheck`; tests: `npm run test`.

---

### Task 1: Capturing disables the capturer

**Files:**
- Modify: `src/game/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `Unit` action flags.
- Produces: after a successful `captureVillage`, the capturer's `hasMoved`, `hasAttacked`, `hasHealed` are `true`.

- [ ] **Step 1: Add the failing test**

Append to `tests/capture.test.ts` (inside the `captureVillage` describe):

```ts
  it('disables the capturer for the rest of the round', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.ownedBy = 1;
    village.claimedByVillage = { q: 0, r: 0 };
    const capturer = makeUnit('c', 0, 0, 0);
    village.unit = capturer;
    map.tiles.push(village);
    captureVillage(map, village, capturer);
    expect(capturer.hasMoved).toBe(true);
    expect(capturer.hasAttacked).toBe(true);
    expect(capturer.hasHealed).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/capture.test.ts`
Expected: FAIL — flags stay `false`.

- [ ] **Step 3: Implement**

In `src/game/capture.ts` `captureVillage`, after the guard `if (!settlement.captureReady) return { ownerDied: false };`, add:

```ts
  capturer.hasMoved = true;
  capturer.hasAttacked = true;
  capturer.hasHealed = true;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/capture.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/capture.ts tests/capture.test.ts
git commit -m "feat: capturing a village disables the capturer for the round"
```

---

### Task 2: Spawned units are idle and spawns ignore capacity

**Files:**
- Modify: `src/game/spawn.ts`
- Modify: `src/game/ai.ts`
- Test: `tests/spawn.test.ts`

**Interfaces:**
- Consumes: `Unit` action flags.
- Produces: `spawnUnit` creates a unit with all four action flags `true` and no capacity gate; `ai.ts` spawns when the village tile is empty.

- [ ] **Step 1: Update the failing tests**

In `tests/spawn.test.ts`:

Replace the `rejects when at capacity` test (lines 67-76) with:

```ts
  it('spawns even when at capacity if the tile is empty', () => {
    const map = makeMap();
    const village = map.tiles[0];
    const away = makeTile(1, 0);
    away.unit = { id: 'b', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hasCollected: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
  });
```

Add a new test at the end of the `spawnUnit` describe:

```ts
  it('spawned units cannot act until the next round', () => {
    const map = makeMap();
    const village = map.tiles[0];
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
    expect(village.unit!.hasMoved).toBe(true);
    expect(village.unit!.hasAttacked).toBe(true);
    expect(village.unit!.hasHealed).toBe(true);
    expect(village.unit!.hasCollected).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/spawn.test.ts`
Expected: FAIL — the idle-unit test and the at-capacity test fail.

- [ ] **Step 3: Implement `spawnUnit`**

In `src/game/spawn.ts`:

- Remove the capacity gate line: `if (unitsInVillage(map, villageTile) >= villageCapacity(settlement.level)) return false;`
- Change the created unit's flags to all `true`:

```ts
    hasMoved: true,
    hasAttacked: true,
    hasHealed: true,
    hasCollected: true,
```

- Remove the now-unused import: `import { villageCapacity, unitsInVillage } from './village';`

- [ ] **Step 4: Update the AI spawn condition**

In `src/game/ai.ts`, change the spawn condition:

```ts
    if (
      rng.next() <= 0.5 &&
      !tile.unit &&
      unitsInVillage(map, tile) < villageCapacity(tile.settlement!.level)
    ) {
```

to:

```ts
    if (rng.next() <= 0.5 && !tile.unit) {
```

Remove the now-unused import `import { villageCapacity, unitsInVillage } from './village';` (line 6) if nothing else uses it.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/spawn.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/spawn.ts src/game/ai.ts tests/spawn.test.ts
git commit -m "feat: spawned units idle until next round and spawns ignore capacity"
```

---

### Task 3: Village names

**Files:**
- Modify: `src/game/names.ts`
- Modify: `src/game/mapGen.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: `tests/names.test.ts`, `tests/mapGen.test.ts`

**Interfaces:**
- Produces: `VILLAGE_ADJECTIVES`, `VILLAGE_NOUNS`, `generateVillageNames(count, rng): string[]`; `Settlement.name?: string`; map settlements all named; village labels show the name.

- [ ] **Step 1: Add failing tests**

In `tests/names.test.ts`, extend the import and add a test:

```ts
import {
  ADJECTIVES,
  ANIMALS,
  VILLAGE_ADJECTIVES,
  VILLAGE_NOUNS,
  generatePlayerNames,
  generateVillageNames,
} from '../src/game/names';
```

```ts
  it('generates village names from the village word pools', () => {
    const names = generateVillageNames(4, new SeededRandom(9));
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
    expect(VILLAGE_ADJECTIVES).toHaveLength(10);
    expect(VILLAGE_NOUNS).toHaveLength(10);
  });
```

In `tests/mapGen.test.ts`, add:

```ts
  it('assigns a name to every settlement', () => {
    const map = generateMap(2, 123);
    const settlements = map.tiles.filter((t) => t.settlement);
    expect(settlements.length).toBe(4);
    for (const t of settlements) {
      expect(t.settlement!.name).toBeTruthy();
    }
  });
```

(Verify `generateMap` is already imported in `tests/mapGen.test.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/names.test.ts tests/mapGen.test.ts`
Expected: FAIL — `generateVillageNames` / `VILLAGE_ADJECTIVES` missing; settlements have no name.

- [ ] **Step 3: Implement the generator**

In `src/game/names.ts`, append:

```ts
export const VILLAGE_ADJECTIVES = [
  'green', 'golden', 'old', 'stone', 'hidden',
  'sunny', 'misty', 'quiet', 'high', 'deep',
];

export const VILLAGE_NOUNS = [
  'oak', 'hill', 'bridge', 'well', 'meadow',
  'brook', 'moss', 'pines', 'rock', 'gate',
];

export function generateVillageNames(count: number, rng: SeededRandom): string[] {
  const combos = VILLAGE_ADJECTIVES.flatMap((adj) =>
    VILLAGE_NOUNS.map((noun) => `${capitalize(adj)} ${capitalize(noun)}`),
  );
  return rng.shuffle(combos).slice(0, count);
}
```

- [ ] **Step 4: Assign names in `mapGen`**

In `src/game/mapGen.ts`:

Add the import: `import { generateVillageNames } from './names';`

Add `name?: string;` to the `Settlement` interface.

After `const rng = new SeededRandom(seed);` add:

```ts
  const villageNames = generateVillageNames(playerCount * 2, rng);
```

Change the settlement assignment loop:

```ts
  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p];
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1, captureReady: false, name: villageNames[p * 2] };
    tileMap.get(axialKey(free))!.settlement = { owner: null, level: 1, captureReady: false, name: villageNames[p * 2 + 1] };
  }
```

- [ ] **Step 5: Show the name in the village label**

In `src/render/mapRenderer.ts`, change the owned-village label text:

```ts
      const label = new Text({
        text: `${tile.settlement.name ?? ''} ${count}/${capacity}`.trim(),
        style: { fontSize: 10, fill: 0xffffff },
        resolution: textResolution,
      });
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/names.test.ts tests/mapGen.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/names.ts src/game/mapGen.ts src/render/mapRenderer.ts tests/names.test.ts tests/mapGen.test.ts
git commit -m "feat: generate village names and show them on the map"
```

---

### Task 4: HP bars above territory and selection borders

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `renderMap` draws HP bars after `drawOwnedBorders` and `drawHighlights`.

- [ ] **Step 1: Defer HP-bar drawing**

In `src/render/mapRenderer.ts`, at the top of `renderMap` (before the tile loop), add:

```ts
  const hpBars: { unit: Unit; position: { x: number; y: number } }[] = [];
```

In the tile loop, replace:

```ts
      container.addChild(unitSprite);
      addHpBar(container, tile.unit, p, hexSize, textResolution);
```

with:

```ts
      container.addChild(unitSprite);
      hpBars.push({ unit: tile.unit, position: p });
```

After the borders, change:

```ts
  drawOwnedBorders(container, map, players, hexSize);
  drawHighlights(container, app, map, selection, reachableKeys, attackableKeys, hexSize);

  return container;
```

to:

```ts
  drawOwnedBorders(container, map, players, hexSize);
  drawHighlights(container, app, map, selection, reachableKeys, attackableKeys, hexSize);
  for (const hp of hpBars) {
    addHpBar(container, hp.unit, hp.position, hexSize, textResolution);
  }

  return container;
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: draw hp bars above territory and selection borders"
```

---

### Task 5: Spawn limits in the UI

**Files:**
- Modify: `src/screens/hud/ActionToolbar.tsx`
- Modify: `src/ui/SpawnDialog.tsx`

**Interfaces:**
- Consumes: `spawnUnit` rule (Task 2): spawning is gated only by the village tile being empty and affordability.
- Produces: spawn buttons disabled only when the village tile has a unit or money is insufficient.

- [ ] **Step 1: Update `ActionToolbar`**

In `src/screens/hud/ActionToolbar.tsx`, inside the owned-village branch, replace:

```tsx
    if (isOwned) {
      const capacity = villageCapacity(settlement.level);
      const count = unitsInVillage(map, tile);
      const minPrice = Math.min(...Object.values(UNIT_TYPES).map((t) => t.price));
      const spawnDisabled = !!tile.unit || count >= capacity || players[0].resources.money < minPrice;
```

with:

```tsx
    if (isOwned) {
      const minPrice = Math.min(...Object.values(UNIT_TYPES).map((t) => t.price));
      const spawnDisabled = !!tile.unit || players[0].resources.money < minPrice;
```

Remove the now-unused imports `villageCapacity, unitsInVillage` from `'../../game/village'` (delete the whole import line if nothing else uses it).

- [ ] **Step 2: Update `SpawnDialog`**

In `src/ui/SpawnDialog.tsx`, replace:

```tsx
  const capacity = villageCapacity(village.settlement.level);
  const count = unitsInVillage(map, village);
  const full = !!village.unit || count >= capacity;
  const money = players[0].resources.money;
```

with:

```tsx
  const full = !!village.unit;
  const money = players[0].resources.money;
```

Change the header:

```tsx
        <div>Spawn a unit ({count}/{capacity})</div>
```

to:

```tsx
        <div>Spawn a unit</div>
```

Remove the now-unused imports `villageCapacity, unitsInVillage` from `'../game/village'`.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/screens/hud/ActionToolbar.tsx src/ui/SpawnDialog.tsx
git commit -m "feat: allow spawns on any empty village tile"
```

---

### Task 6: Enriched selected-info block

**Files:**
- Modify: `src/screens/hud/SelectedInfo.tsx`

**Interfaces:**
- Consumes: `TILE_TYPE_COLORS`, `TILE_TYPE_NAMES` (tileTypes), `UNIT_TYPES`/`UNIT_TYPE_NAMES` (units), `attackDamage` (combat), `tileResourceYield`/`villageIncome` (capture), `tileAt` (selection).
- Produces: terrain shows terrain-colored background + expected resources; unit shows linked village name, HP bar, attack damage, attack distance; village shows name and expected income.

- [ ] **Step 1: Rewrite `SelectedInfo`**

Replace the entire contents of `src/screens/hud/SelectedInfo.tsx`:

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES } from '../../game/tribes';
import { TILE_TYPE_COLORS, TILE_TYPE_NAMES } from '../../game/tileTypes';
import { UNIT_TYPE_NAMES, UNIT_TYPES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { canAfford, UPGRADE_COST } from '../../game/resources';
import { attackDamage } from '../../game/combat';
import { tileResourceYield, villageIncome } from '../../game/capture';

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function isLightColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function SelectedInfo(): React.ReactElement {
  const selection = useGameStore((s) => s.selection);
  const players = useGameStore((s) => s.players);

  if (!selection) return <div id="selected-info" />;
  const map = gameController.getMap();
  if (!map) return <div id="selected-info" />;
  const tile = tileAt(map, selection.q, selection.r);
  if (!tile) return <div id="selected-info" />;

  const lines: React.ReactElement[] = [];
  let background: string | undefined;
  let darkText = false;

  if (selection.kind === 'unit') {
    const unit = tile.unit!;
    const player = players[unit.owner];
    const tribe = TRIBES.find((t) => t.id === player.tribe)!;
    const villageName = unit.spawnVillage
      ? tileAt(map, unit.spawnVillage.q, unit.spawnVillage.r)?.settlement?.name ?? '—'
      : '—';
    const maxHp = UNIT_TYPES[unit.type].maxHp;
    lines.push(<div key="n">Name: {UNIT_TYPE_NAMES[unit.type]}</div>);
    lines.push(<div key="tr">Tribe: {tribe.name}</div>);
    lines.push(<div key="p">Player: <span style={{ textDecoration: player.isActive ? 'none' : 'line-through' }}>{player.name}</span></div>);
    lines.push(<div key="v">Village: {villageName}</div>);
    lines.push(
      <div key="hp">
        HP: {unit.hp}/{maxHp}
        <div style={{ height: 8, background: '#333', borderRadius: 2, marginTop: 2 }}>
          <div style={{ height: 8, width: `${(unit.hp / maxHp) * 100}%`, background: '#0f0', borderRadius: 2 }} />
        </div>
      </div>,
    );
    lines.push(<div key="dmg">Attack damage: {attackDamage(unit)}</div>);
    lines.push(<div key="dist">Attack distance: {unit.attackDistance}</div>);
  } else if (selection.kind === 'village') {
    const settlement = tile.settlement!;
    const owner = settlement.owner;
    lines.push(<div key="n">Name: {settlement.name ?? 'Settlement'}</div>);
    lines.push(<div key="l">Level: {settlement.level}</div>);
    lines.push(<div key="income">Expected income: {villageIncome(map, tile)} money</div>);
    if (owner !== null) {
      const player = players[owner];
      const tribe = TRIBES.find((t) => t.id === player.tribe)!;
      lines.push(<div key="tr">Tribe: {tribe.name}</div>);
      lines.push(<div key="p">Player: <span style={{ textDecoration: player.isActive ? 'none' : 'line-through' }}>{player.name}</span></div>);
      if (owner === 0) {
        const affordable = canAfford(players[0].resources, UPGRADE_COST);
        lines.push(
          <button key="u" disabled={!affordable} onClick={() => gameController.upgradeSelectedVillage()}>
            Upgrade village
          </button>,
        );
      }
    }
  } else {
    const terrain = tile.terrain;
    const color = TILE_TYPE_COLORS[terrain];
    background = colorCss(color);
    darkText = isLightColor(color);
    const gained = tileResourceYield(tile);
    const resourceText = gained.wood > 0 ? `${gained.wood} wood` : gained.stone > 0 ? `${gained.stone} stone` : 'no resources';
    lines.push(<div key="n">Name: {TILE_TYPE_NAMES[terrain]}</div>);
    lines.push(<div key="r">Resources: {resourceText}</div>);
  }

  return (
    <div id="selected-info" style={{ background, color: darkText ? '#111' : undefined }}>
      {lines}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/screens/hud/SelectedInfo.tsx
git commit -m "feat: enrich the selected-info block per selection kind"
```

---

## Final Verification

- [ ] Run `npm run test` — all unit tests pass.
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual (`npm run dev`): capture disables the unit; freshly spawned units can't act; multiple spawns per round across empty villages; HP bars sit above territory/selection borders; village labels show names; selected-info shows terrain resources / unit details / village income.
