# Village-Scaled Skill Prices Design

Date: 2026-08-24

## Problem

Skill costs are flat (`3 × level` money). We want skill prices to scale with the
player's current owned-village count so that more villages make skills more
expensive:

- 1 owned village → current (base) price
- 2 owned villages → base + 1 money
- 3 owned villages → base + 2 money
- and so on

The scaling applies to all players (human and AI alike).

## Design

### Formula

```
skillCost(id, villageCount) = 3 * SKILLS[id].level + max(0, villageCount - 1)
```

### `countOwnedVillages` helper

Add to `src/game/village.ts`:

```ts
export function countOwnedVillages(map: GameMap, playerIndex: number): number {
  let count = 0;
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner === playerIndex) count++;
  }
  return count;
}
```

### `src/game/skills.ts`

Change the three pricing functions to accept `villageCount: number`:

- `skillCost(id: SkillId, villageCount: number): number` — formula above.
- `canOpenSkill(player: Player, id: SkillId, villageCount: number): boolean` — uses
  `skillCost(id, villageCount)` for the affordability check.
- `openSkill(player: Player, id: SkillId, villageCount: number): boolean` — uses
  `skillCost(id, villageCount)` when paying and the new `canOpenSkill` signature.

`hasSkill` is unchanged.

### Call sites

- `src/game/simulator.ts` `doOpenSkill` (line 313): pass
  `countOwnedVillages(this.map, player.index)`.
- `src/game/ai.ts` (line 135): pass `villages.length` (already computed at line 84).
- `src/screens/SkillTreeScreen.tsx`: derive the local player's village count once from
  `gameController.getMap()` (fall back to 1 if no map); show `skillCost(id, count)`
  on each node (line 102) and in the detail modal (line 189), and call
  `canOpenSkill(human, selected, count)` (line 197).

## Files touched

- `src/game/village.ts` (add `countOwnedVillages`)
- `src/game/skills.ts` (pricing signatures)
- `src/game/simulator.ts` (call site)
- `src/game/ai.ts` (call site)
- `src/screens/SkillTreeScreen.tsx` (call sites + display)
- `tests/skills.test.ts` (new-signature tests)

## Testing

- `tests/skills.test.ts`: update existing calls for the new `villageCount` argument
  (1 village = current prices); add cases asserting +1 at 2 villages, +2 at 3
  villages, and that `openSkill` pays the scaled amount.
- Run `npm run typecheck` and `npm test`.
- Manual (`npm run dev`): skill tree shows base prices at 1 village; after capturing
  a second village, prices increase by 1; the AI uses scaled prices too.
