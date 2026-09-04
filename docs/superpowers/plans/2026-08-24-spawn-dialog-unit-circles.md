# Spawn Dialog Unit Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the spawn dialog into a row of circular unit-texture options with name + price below, disabled states with a reason modal, and outside-click-to-close.

**Architecture:** Move the unit texture filename map into pure game data (`src/game/units.ts`), have the renderer import it, then rewrite `src/ui/SpawnDialog.tsx` in place. The reason modal is a nested overlay driven by local `useState` inside `SpawnDialog`; no store changes.

**Tech Stack:** TypeScript, React (inline styles), PixiJS (unchanged renderer), Vitest.

## Global Constraints

- No store (`gameStore`) changes.
- `spawnUnit` (village-full guard, cost validation) in `src/game/spawn.ts` is unchanged.
- Style conventions: inline `style={{...}}`, no CSS files, no comments in code.
- Tests run with `npm test` (vitest run, node env, only `tests/**/*.test.ts`); typecheck with `npm run typecheck`.
- Image URLs use `${import.meta.env.BASE_URL}textures/<file>` (BASE_URL is `/hex/`).
- Swordsman is the only skill-gated unit; its gate is `hasSkill(player, 'swordsman')`.

---

### Task 1: Move `UNIT_IMAGE_FILES` into game data

**Files:**
- Modify: `src/game/units.ts`
- Modify: `src/render/textureFactory.ts:6,37-42`
- Test: `tests/units.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const UNIT_IMAGE_FILES: Record<UnitType, string>` in `src/game/units.ts`, keyed by `UnitType` (`'warrior' | 'rider' | 'archer' | 'swordsman'`), values the PNG filenames. Task 2 consumes this.

- [ ] **Step 1: Write the failing test**

Append to `tests/units.test.ts` (after the existing `UNIT_TYPES` describe block). Update the import on line 2-11 to include `UNIT_IMAGE_FILES`:

```ts
import {
  UNIT_TYPES,
  UNIT_IMAGE_FILES,
  UnitType,
  canAttack,
  canHeal,
  canMove,
  healUnit,
  moveRange,
  HEAL_AMOUNT,
} from '../src/game/units';
```

Add the test:

```ts
describe('UNIT_IMAGE_FILES', () => {
  it('maps every unit type to its texture file', () => {
    expect(UNIT_IMAGE_FILES).toEqual({
      warrior: 'warrior.png',
      rider: 'rider.png',
      archer: 'archer.png',
      swordsman: 'swordsman.png',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/units.test.ts -t UNIT_IMAGE_FILES`
Expected: FAIL — `UNIT_IMAGE_FILES` is not exported.

- [ ] **Step 3: Add the export and update the renderer**

In `src/game/units.ts`, after the `UNIT_TYPES` record (line 20), add:

```ts
export const UNIT_IMAGE_FILES: Record<UnitType, string> = {
  warrior: 'warrior.png',
  rider: 'rider.png',
  archer: 'archer.png',
  swordsman: 'swordsman.png',
};
```

In `src/render/textureFactory.ts`:
- Change the import on line 6 to:
  ```ts
  import { UnitType, UNIT_IMAGE_FILES, UNIT_TYPES } from '../game/units';
  ```
- Delete the local `UNIT_IMAGE_FILES` definition (lines 37-42):
  ```ts
  const UNIT_IMAGE_FILES: Record<UnitType, string> = {
    warrior: 'warrior.png',
    archer: 'archer.png',
    swordsman: 'swordsman.png',
    rider: 'rider.png',
  };
  ```
  Note: `UnitType` is still used elsewhere in the file (line 276), so keep that import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/units.test.ts -t UNIT_IMAGE_FILES`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts src/render/textureFactory.ts tests/units.test.ts
git commit -m "feat: move unit texture file map into game data"
```

---

### Task 2: Rewrite `SpawnDialog.tsx` with circles and reason modal

**Files:**
- Modify: `src/ui/SpawnDialog.tsx` (full rewrite)

**Interfaces:**
- Consumes: `UNIT_IMAGE_FILES` from `src/game/units` (Task 1); `UNIT_TYPES`, `UNIT_TYPE_NAMES`, `UnitType` from `src/game/units`; `canAfford` from `src/game/resources`; `hasSkill` from `src/game/skills`; `tileAt` from `src/game/selection`; `gameController`; `useGameStore`.
- Produces: unchanged public contract — renders nothing when `spawnDialogOpen` is false; calls `gameController.spawnSelectedVillage(type)` on enabled click and `useGameStore.setSpawnDialogOpen(false)` on close.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/ui/SpawnDialog.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { tileAt } from '../game/selection';
import { hasSkill } from '../game/skills';
import { UNIT_IMAGE_FILES, UNIT_TYPES, UNIT_TYPE_NAMES, UnitType } from '../game/units';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

const overlayStyle = (z: number) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
  zIndex: z,
});

const cardStyle = {
  background: '#000',
  padding: 16,
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 320,
};

export function SpawnDialog(): React.ReactElement {
  const open = useGameStore((s) => s.spawnDialogOpen);
  const setOpen = useGameStore((s) => s.setSpawnDialogOpen);
  const players = useGameStore((s) => s.players);
  const localIndex = useGameStore((s) => s.localPlayerIndex);
  const selection = useGameStore((s) => s.selection);
  const [reasonFor, setReasonFor] = useState<UnitType | null>(null);

  useEffect(() => {
    if (!open) setReasonFor(null);
  }, [open]);

  if (!open) return <></>;
  const map = gameController.getMap();
  if (!map || !selection) return <></>;
  const village = tileAt(map, selection.q, selection.r);
  if (!village || !village.settlement) return <></>;
  const player = players[localIndex];
  if (!player) return <></>;

  const disabledReasons = (type: UnitType): string[] => {
    const info = UNIT_TYPES[type];
    const reasons: string[] = [];
    if (player.resources.money < info.price) {
      reasons.push(`Not enough money — need ${info.price}, have ${player.resources.money}`);
    }
    if (info.priceOre > 0 && player.resources.ore < info.priceOre) {
      reasons.push(`Not enough ore — need ${info.priceOre}, have ${player.resources.ore}`);
    }
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) {
      reasons.push('Requires the Swordsman skill');
    }
    return reasons;
  };

  return (
    <div style={overlayStyle(30)} onClick={() => setOpen(false)}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>Spawn a unit</div>
          <button onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {(Object.keys(UNIT_TYPES) as UnitType[]).map((type) => {
            const reasons = disabledReasons(type);
            const disabled = reasons.length > 0;
            const info = UNIT_TYPES[type];
            const oreText = info.priceOre > 0 ? ` + ${info.priceOre} ore` : '';
            return (
              <button
                key={type}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  padding: 8,
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? 'default' : 'pointer',
                }}
                onClick={() => (disabled ? setReasonFor(type) : gameController.spawnSelectedVillage(type))}
              >
                <span
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '2px solid #888',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#333',
                  }}
                >
                  <img
                    src={`${TEXTURE_BASE}${UNIT_IMAGE_FILES[type]}`}
                    alt={UNIT_TYPE_NAMES[type]}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 70%' }}
                  />
                </span>
                <span>{UNIT_TYPE_NAMES[type]}</span>
                <span style={{ fontSize: 12 }}>{info.price}{oreText}</span>
              </button>
            );
          })}
        </div>
      </div>
      {reasonFor && (
        <div
          style={overlayStyle(31)}
          onClick={(e) => {
            e.stopPropagation();
            setReasonFor(null);
          }}
        >
          <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
            <div>{UNIT_TYPE_NAMES[reasonFor]}</div>
            {disabledReasons(reasonFor).map((reason) => (
              <div key={reason}>{reason}</div>
            ))}
            <button onClick={() => setReasonFor(null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Notes:
- `overlayStyle` / `cardStyle` are plain object literals (no type annotation) so no `React.CSSProperties` namespace issue; assigning them to `style` works because TS checks the literal against `CSSProperties`.
- The reason modal's overlay calls `e.stopPropagation()` so dismissing it does not bubble up and close the spawn dialog.
- The old imports of `canAfford`, `unitsInVillage`, `villageCapacity` are dropped — they are no longer used (the village-full guard stays in `spawnUnit` and is unreachable from here).
- `overlayStyle(31)` z-index keeps the reason modal above the dialog card (`zIndex: 30` overlay).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: all tests pass (no existing test asserts the spawn dialog markup).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the app, start a game.

Checklist:
1. Select an owned village with the toolbar visible → click **Spawn** → dialog opens centered with the dark backdrop.
2. Dialog shows 4 circles each with the unit texture, unit name below, and price below that (swordsman shows "15 + 3 ore").
3. Clicking the backdrop closes the dialog; clicking inside the dialog does not.
4. With enough money but no Swordsman skill: the swordsman circle is dimmed (opacity 0.4); the others are full opacity.
5. Click the disabled swordsman circle → reason modal appears on top titled "Swordsman" listing "Requires the Swordsman skill" (and any money/ore shortfalls). Clicking OK/backdrop returns to the spawn dialog (spawn dialog stays open).
6. Click an enabled circle (e.g. Warrior) → unit spawns on the village, dialog closes.
7. Open the dialog, click backdrop to close, reopen → no stale reason modal.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SpawnDialog.tsx
git commit -m "feat: redesign spawn dialog with unit circles and reason modal"
```
