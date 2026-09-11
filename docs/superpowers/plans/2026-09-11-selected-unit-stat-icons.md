# Selected-Unit Stat Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `HP`/`ATK`/`DEF`/`UPKEEP` text abbreviations in the selected-unit line of `HudSelected` with 16px icons, keeping the values inline on the same row as the unit name.

**Architecture:** The unit line becomes a composite PixiJS row (name label + 4 pairs of 16px icon sprite and value label) built inside `HudSelected.update()`. Icons load through the existing cached `makeIcon(name, size)` helper from `src/ui/kit/icon.ts`; the i18n key `hud.selected.unit` shrinks to just the name + optional active marker. Line-index bookkeeping (`lines`, `bolds`, `lineWidths`) is preserved via a placeholder string so the `?` unit-help button and panel-width math keep working.

**Tech Stack:** TypeScript, PixiJS 8 (Sprite/Container/Text), Vitest, Vite.

## Global Constraints

- No new asset files: `public/textures/16/hp-16.png`, `attack-16.png`, `def-16.png`, `gold-16.png` already exist.
- Icons load via `makeIcon('16/<file>.png', 16)`; `makeIcon` resolves names against `textures/`.
- Row height stays `lineH = 18`; icons (16px) are vertically centered.
- `hud.selected.unit` becomes `{name}{active}` in both `en.ts` and `ru.ts`.
- Buff lines below the unit (e.g. `+3 DEF — village wall`) are untouched.
- Tests run with `npm test`; typecheck with `npm run typecheck`.
- Tests already stub the global `Image` (tests/setup.ts), so `makeIcon` works in Vitest without loading real textures.

---

### Task 1: Update the HUD tests to expect the icon row

**Files:**
- Modify: `tests/hudSelected.test.ts:126-141`
- Test: `tests/hudSelected.test.ts`

**Interfaces:**
- Consumes: current `HudSelected` behavior (unit line is still a single text label at this point).
- Produces: new test expectations that later tasks must satisfy — the unit name label contains `Warrior`, the panel contains standalone value texts `50/50`, `20`, `0`, `1`, no `DEF 0`/`UPKEEP` text, and exactly 4 sprites of width 16 on the unit row.

- [ ] **Step 1: Add the `Sprite` import and a sprite-walking helper**

Change the pixi import on line 2:

```ts
import { Container, Sprite, Text } from 'pixi.js';
```

Append this helper after the existing `findText` helper at the bottom of the file (line ~269):

```ts
function findSprites(root: Container): Sprite[] {
  const out: Sprite[] = [];
  const walk = (c: Container): void => {
    for (const ch of c.children) {
      if (ch instanceof Sprite) out.push(ch as Sprite);
      if (ch instanceof Container) walk(ch as Container);
    }
  };
  walk(root);
  return out;
}
```

- [ ] **Step 2: Update the two failing assertions**

In the test `'does not show Owner or Village lines for an owned village with a unit'` (line 126), change line 129:

```ts
    expect(all).toContain('Warrior HP');
```

to:

```ts
    expect(all).toContain('Warrior');
```

In the test `'shows the unit defense and walled-village buff on the selected unit'` (line 135), replace lines 138-139:

```ts
    expect(all).toContain('DEF 0');
    expect(all).toContain('UPKEEP 1');
    expect(all).toContain('+3 DEF — village wall');
```

with:

```ts
    const labels = texts();
    expect(labels).toContain('50/50');
    expect(labels).toContain('20');
    expect(labels).toContain('0');
    expect(labels).toContain('1');
    expect(all).toContain('+3 DEF — village wall');
    expect(all).not.toContain('DEF 0');
    expect(all).not.toContain('UPKEEP');
```

- [ ] **Step 3: Add a test that the unit row renders 4 stat icons**

Add this test right after the `'shows the unit defense and walled-village buff'` test (after line 141):

```ts
it('renders 4 stat icons inline on the selected unit line', () => {
    mount(1, 1, 0, { unitOnVillage: true });
    const widths = findSprites((hud as unknown as { el: Container }).el!)
      .map((s) => s.width);
    expect(widths).toEqual([16, 16, 16, 16]);
  });
```

- [ ] **Step 4: Run the HUD tests to verify they fail (red)**

Run: `npm test -- tests/hudSelected.test.ts`
Expected: FAIL — the new sprite-count test sees 0 sprites and `not.toContain('DEF 0')` fails because the unit line is still the old `... DEF 0 UPKEEP 1 ...` text.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/hudSelected.test.ts
git commit -m "test: expect 16px stat icons in the selected unit line"
```

---

### Task 2: Render the unit line as an icon row

**Files:**
- Modify: `src/i18n/locales/en.ts:322`
- Modify: `src/i18n/locales/ru.ts:323`
- Modify: `src/ui/hud/HudSelected.ts:42-174`

**Interfaces:**
- Consumes: test expectations from Task 1; existing `makeIcon(name, size)` from `src/ui/kit/icon.ts`; existing helpers `attackDamage`, `unitMaintenance`, `UNIT_TYPES`, `t`.
- Produces: the composite unit row described in the spec; `lineWidths[unitLineIndex]` continues to hold the full row width so the `?` help button (line ~242) stays positioned after the icons.

- [ ] **Step 1: Shrink the i18n strings**

In `src/i18n/locales/en.ts:322`, replace:

```ts
  'hud.selected.unit': '{name} HP {hp}/{max}{active} ATK {atk} DEF {def} UPKEEP {upkeep}',
```

with:

```ts
  'hud.selected.unit': '{name}{active}',
```

In `src/i18n/locales/ru.ts:323`, replace:

```ts
  'hud.selected.unit': '{name} HP {hp}/{max}{active} ATK {atk} ЗАЩ {def} СОД {upkeep}',
```

with:

```ts
  'hud.selected.unit': '{name}{active}',
```

- [ ] **Step 2: Add the `makeIcon` import**

In `src/ui/hud/HudSelected.ts`, after the `makeLabel` import (line 25):

```ts
import { makeLabel } from '../kit/label';
import { makeIcon } from '../kit/icon';
```

- [ ] **Step 3: Declare the unit-row object**

In `update()` (line ~67), near the other bookkeeping declarations (e.g. after `let buildingLimitLineIndex = -1;` on line 94), add:

```ts
    let unitRow: { name: string; pairs: { icon: string; value: string }[] } | null = null;
```

- [ ] **Step 4: Build the row data in the `tile.unit` block**

Replace lines 107-109:

```ts
      unitLineIndex = lines.length;
      lines.push(t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type], hp: unit.hp, max: maxHp, active: canAct ? ' •' : '', atk: attackDamage(unit), def: unit.defense ?? 0, upkeep: unitMaintenance(unit) }));
      bolds.push(true);
```

with:

```ts
      unitLineIndex = lines.length;
      unitRow = {
        name: t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type], active: canAct ? ' •' : '' }),
        pairs: [
          { icon: '16/hp-16.png', value: `${unit.hp}/${maxHp}` },
          { icon: '16/attack-16.png', value: String(attackDamage(unit)) },
          { icon: '16/def-16.png', value: String(unit.defense ?? 0) },
          { icon: '16/gold-16.png', value: String(unitMaintenance(unit)) },
        ],
      };
      lines.push(''); // placeholder — the unit line renders as a composite icon row
      bolds.push(true);
```

- [ ] **Step 5: Render the composite row in the label loop**

At the top of the render loop (line ~162, right after `for (let i = 0; i < lines.length; i++) {` and its opening brace), insert this special case before the existing `const highlight = ...` line:

```ts
      if (i === unitLineIndex && unitRow) {
        const fill = darkText ? 0x111111 : 0xeeeeee;
        const title = makeLabel(unitRow.name, { fontSize: 13, fill, fontWeight: '700' });
        title.position.set(10, y);
        const row = new Container();
        row.addChild(title);
        let x = 10 + title.width + 7;
        for (const pair of unitRow.pairs) {
          const icon = makeIcon(pair.icon, 16);
          icon.anchor.set(0, 0);
          icon.position.set(x, y + (lineH - 16) / 2);
          const value = makeLabel(pair.value, { fontSize: 13, fill });
          value.position.set(x + 19, y);
          row.addChild(icon, value);
          x += 19 + value.width + 7;
        }
        this.el.addChild(row);
        const contentW = x - 17;
        lineWidths[i] = contentW;
        maxW = Math.max(maxW, contentW);
        y += lineH;
        continue;
      }
```

The existing loop body below stays as-is and handles every other line.

- [ ] **Step 6: Run the HUD tests to verify they go green**

Run: `npm test -- tests/hudSelected.test.ts`
Expected: PASS (4 tests carry the new expectations; 1 of them is the new sprite-count test).

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test`
Expected: all 1035 tests pass.

Run: `npm run typecheck`
Expected: clean (no output).

- [ ] **Step 8: Commit**

```bash
git add src/ui/hud/HudSelected.ts src/i18n/locales/en.ts src/i18n/locales/ru.ts
git commit -m "feat: show selected unit stats as 16px icons in the info panel"
```