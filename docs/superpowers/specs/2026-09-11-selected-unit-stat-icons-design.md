# Selected-Unit Stat Icons Design

Date: 2026-09-11

## Goal

In the selected-hex info panel (`HudSelected`), replace the text abbreviations
`HP`, `ATK`, `DEF`, `UPKEEP` in the unit line with small 16px icons. The numeric
values stay inline next to their icons on the same row as the unit name.

## Icon assets (already present in `public/textures/16/`)

| Stat   | Icon path                      | Shows            |
| ------ | ------------------------------ | ---------------- |
| hp     | `textures/16/hp-16.png`        | `hp/max`         |
| atk    | `textures/16/attack-16.png`    | attack damage    |
| def    | `textures/16/def-16.png`       | defense          |
| upkeep | `textures/16/gold-16.png`      | upkeep           |

Icons are loaded with the existing cached helper `makeIcon(name, size)`
(`src/ui/kit/icon.ts`) using path `16/<file>.png` and size `16`.

## Layout

The unit line becomes a composite row instead of one string label:

`<unit name> [•] <hp icon> hp/max <atk icon> atk <def icon> def <upkeep icon> upkeep`

- Name label (bold) followed by the four icon/value pairs inline, separated by
  small gaps. The ` •` active marker is appended to the name only when the unit
  can act, exactly as today.
- Row height stays 18px (the panel's `lineH`); 16px icons are vertically
  centered in it.
- The `?` unit-help button keeps its position — after the full row width.

## Changes

### `src/ui/hud/HudSelected.ts` (`update()`)

- Build the unit row as a container: name label + 4 groups of
  (`makeIcon('16/<file>.png', 16)` sprite + value label).
- Special-case the unit line in the render loop; record the full row width in
  `lineWidths[unitLineIndex]` so help-button placement and `maxW` stay correct.
- Values: `hp = unit.hp / maxHp`, `atk = attackDamage(unit)`,
  `def = unit.defense ?? 0`, `upkeep = unitMaintenance(unit)` — same data as today.

### i18n

- `hud.selected.unit` becomes `{name}{active}` in both `src/i18n/locales/en.ts`
  and `src/i18n/locales/ru.ts` (HP/ATK/DEF/UPKEEP placeholders removed).
- Buff lines below the unit (e.g. `+3 DEF — village wall`) are unchanged.

### Tests (`tests/hudSelected.test.ts`)

- `'Warrior HP'` assertion → unit name label (e.g. `'Warrior'`).
- `'DEF 0'` / `'UPKEEP 1'` assertions → standalone value texts
  (`'50/50'`, `'20'`, `'0'`, `'1'`) and presence of 4 width-16 sprites on the
  unit row.

## Out of scope

- No change to settlement/building/bridge lines.
- No change to buff calculation, unit data, or other panels.
- No new assets; the four 16px PNGs already exist.