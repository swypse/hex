# Skill Tree Ring Grouping by Parent Design

Date: 2026-08-22

## Problem

The skill tree renders skills per level on concentric rings, but level-2+ skills are ordered
by declaration order only. Skills that share a parent should sit together on their ring, and
the groups should appear in the same order as their parents on the previous ring, so parent
lines do not cross.

## Design

Compute a per-level ring order recursively in `src/screens/SkillTreeScreen.tsx`:

- **Level 1** (roots, `parent === null`): declaration order over `SKILLS` filtered to
  level 1 → `[climbing, water, forestry, science]`.
- **Level L**: take the level-`L-1` ring order; for each parent in that order, emit its
  children at level `L` in declaration order. Groups are therefore contiguous on the ring and
  ordered by the previous ring's parent order.

Concretely for the current skills, level-2 ring order becomes:

1. climbing → `[smithery, swordsman]`
2. water → `[navigation, waterTemples]`
3. forestry → `[forestTemple]`
4. science → `[geology]`

Flattened: `[smithery, swordsman, navigation, waterTemples, forestTemple, geology]`.

### Positioning

Skill `i` of its level's ring order sits at angle `(i / count) * 2π - π/2` on its ring
radius (`level * RING_SPACING`). This is the existing "option A": children occupy
contiguous, evenly-spaced slots; all nodes of a level stay on the same circle.

### Implementation

Replace the level-filter/index logic in `skillPosition` with a recursive ring order:

```ts
function ringOrder(level: number): SkillId[] {
  if (level === 1) {
    return (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].level === 1);
  }
  const prev = ringOrder(level - 1);
  const out: SkillId[] = [];
  for (const p of prev) {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      if (SKILLS[id].level === level && SKILLS[id].parent === p) out.push(id);
    }
  }
  return out;
}
```

`skillPosition` then uses `ringOrder(level)`:

```ts
function skillPosition(id: SkillId): { x: number; y: number } {
  const level = SKILLS[id].level;
  const order = ringOrder(level);
  const index = order.indexOf(id);
  const count = order.length;
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const r = level * RING_SPACING;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}
```

Line/node rendering is unchanged — parents and children are placed consistently, so the
existing parent-child `lines` render without crossing.

## Files touched

- `src/screens/SkillTreeScreen.tsx`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass (no logic tests change).
- Manual: level-2 ring groups children by parent; group order matches the level-1 ring;
  parent-child lines do not cross.
