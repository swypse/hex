# Adaptive Spawn Dialog Circles Design

Date: 2026-08-24

## Problem

The spawn dialog renders its 4 unit circles in a single `flex` row. On narrow
screens (mobile) the circles overflow the `maxWidth: 320` card instead of wrapping,
clipping the options.

## Design

In `src/ui/SpawnDialog.tsx`, change the circles row style from
`{ display: 'flex', gap: 12 }` to:

```ts
{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }
```

- `flexWrap: 'wrap'` lets circles flow onto additional rows when they exceed the
  card width.
- `justifyContent: 'center'` centers each wrapped row (e.g. 3+1 or 2×2 layouts).
- On wide screens nothing changes — all 4 circles still fit in one centered row.
- The card keeps `maxWidth: 320`. The reason-modal card and all other files are
  unaffected.

## Files touched

- `src/ui/SpawnDialog.tsx`

## Testing

- Run `npm run typecheck` and `npm test`.
- Manual (`npm run dev`): at wide window the 4 circles sit in one row; at narrow
  width they wrap into centered multiple rows with no overflow.
