# Design: Capture/spawn action rules, HP bar z-order, village names, selected info

Date: 2026-08-17

## Goal

1. Capturing a village disables the capturer's actions for the round.
2. Spawned units cannot act until the next round.
3. Spawns are unlimited per round, limited only by empty village tiles (no capacity gate).
4. HP bars and labels render above territory and selection borders.
5. Villages get generated names, shown as `"Name N/M"`.
6. The selected-info block shows richer data per selection kind.

## Design

### 1. Capture disables the capturer

In `src/game/capture.ts` `captureVillage`, after a successful capture set on the capturer:

```ts
capturer.hasMoved = true;
capturer.hasAttacked = true;
capturer.hasHealed = true;
```

All `canMove`/`canAttack`/`canHeal`/`canCollect` become false for that unit. Applies to both human and AI captures.

### 2. Spawned units cannot act this round

In `src/game/spawn.ts`, create the spawned unit with all four action flags `true`:

```ts
hasMoved: true,
hasAttacked: true,
hasHealed: true,
hasCollected: true,
```

### 3. Unlimited spawns (one per empty village tile)

- `spawnUnit` (`spawn.ts`): remove the `unitsInVillage >= villageCapacity(level)` gate; keep the `villageTile.unit` check and the money check.
- `ActionToolbar`: `spawnDisabled` no longer includes `count >= capacity` (the count/capacity locals are removed); it is `!isOwned || !!village.unit || money < minPrice`.
- `SpawnDialog`: `full` becomes `!!village.unit` only; the header no longer shows `(count/capacity)`.
- `ai.ts`: the AI `spawn` plan condition drops the capacity check (`!tile.unit` only); remove now-unused `unitsInVillage`/`villageCapacity` imports.
- `villageCapacity`/`unitsInVillage` stay in `villageIncome` (overflow penalty) — unchanged.

### 4. HP bars/labels above borders

In `src/render/mapRenderer.ts`, defer HP-bar drawing: during the tile loop, collect `{ unit, position }` tuples instead of calling `addHpBar`; after `drawOwnedBorders` and `drawHighlights`, call `addHpBar` for each collected unit so bars and labels render on top.

### 5. Village names

- `src/game/names.ts`: add village-only word pools and a generator:

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

- `Settlement` (`mapGen.ts`) gains optional `name?: string`.
- `mapGen`: generate `playerCount * 2` village names and assign one to every settlement at creation.
- `mapRenderer`: the owned-village label shows `"${settlement.name ?? ''} ${count}/${capacity}"` (trimmed).

### 6. Selected-info rework

`src/screens/hud/SelectedInfo.tsx`:

- **Terrain** (`selection.kind === 'terrain'`): block background = `TILE_TYPE_COLORS[tile.terrain]`; add the tile's expected resources via `tileResourceYield(tile)` (show "1 wood", "1 stone", or "no resources").
- **Unit**: add the linked village name (find the settlement at `unit.spawnVillage`; `—` if none), an HTML HP bar (`unit.hp / maxHp`), attack damage (`attackDamage(unit)`), and attack distance (`unit.attackDistance`).
- **Village**: add the village name (`tile.settlement.name`) and expected income (`villageIncome(map, tile)`).

## Files touched

- `src/game/capture.ts` — capture disables capturer.
- `src/game/spawn.ts` — spawned units inactive; remove capacity gate.
- `src/game/ai.ts` — spawn condition drops capacity.
- `src/game/names.ts` — village name dicts + generator.
- `src/game/mapGen.ts` — `Settlement.name`, assign names.
- `src/render/mapRenderer.ts` — HP bar z-order; village label with name.
- `src/screens/hud/ActionToolbar.tsx`, `src/ui/SpawnDialog.tsx` — spawn limits.
- `src/screens/hud/SelectedInfo.tsx` — richer info.
- Tests: `names.test.ts` (village names), `spawn.test.ts` (no capacity gate, flags), `capture.test.ts` (capturer disabled), `mapGen.test.ts` (settlements named).

## Testing

- `spawnUnit` spawns with all action flags set and ignores capacity; `captureVillage` disables the capturer (unit tests).
- `generateVillageNames` returns distinct names from the village dicts (names tests).
- `mapGen` settlements all have names (mapGen tests).
- Manual (`npm run dev`): capture disables the unit; freshly spawned units can't act; multiple spawns per round across empty villages; HP bars above territory/selection borders; village labels show names; selected-info shows terrain resources / unit details / village income.
