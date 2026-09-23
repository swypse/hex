# Money Panel Icons and Merged Turn Info Design

Date: 2026-08-22

## Problem

Two UI changes:

1. In the resources/money panel, the resource icons should be 1.5× larger and the
   `Wood:`, `Stone:`, `Ore:` label words removed (keep icon + number + income).
2. The separate `#mode-label` box should be merged into `#turn-info`, producing a single
   left-top box: `"Mode name. Turn N — TribeName"`.

## Design

### 1. Money panel (`src/screens/hud/MoneyInfo.tsx`)

- `iconStyle.width`/`height`: `18` → `27` (1.5×).
- Remove the `Wood: `, `Stone: `, `Ore: ` label prefixes from the spans; keep the icon, the
  count, and the income `(+N)` suffix for each resource. Money already has no label.

```tsx
<img src={`${TEXTURE_BASE}coin.png`} style={iconStyle} alt="money" />
<span>{money}{moneyIncome > 0 ? ` (+${moneyIncome})` : ''}</span>
<img src={`${TEXTURE_BASE}wood.png`} style={iconStyle} alt="wood" />
<span>{wood}{building.wood > 0 ? ` (+${building.wood})` : ''}</span>
<img src={`${TEXTURE_BASE}stone.png`} style={iconStyle} alt="stone" />
<span>{stone}{building.stone > 0 ? ` (+${building.stone})` : ''}</span>
<img src={`${TEXTURE_BASE}ore.png`} style={iconStyle} alt="ore" />
<span>{ore}{building.ore > 0 ? ` (+${building.ore})` : ''}</span>
```

### 2. Merge mode-label into turn-info

- `src/screens/GameScreen.tsx`: remove the `<div id="mode-label">{GAME_MODE_NAMES[mode]}</div>`
  line and the now-unused `mode`/`GAME_MODE_NAMES` references.
- `src/screens/hud/TurnInfo.tsx`: render a single box containing
  `"{GAME_MODE_NAMES[mode]}. Turn {turn} — {tribeName}"`. Read `mode` from the store, and
  derive `tribeName` from the local player's tribe via `TRIBES`. Keep the strikethrough for
  inactive players.
- `index.html`: move `#turn-info` to the left-top corner (`left: 8px; top: 8px`), and
  stack `#players-list` below it (`top` raised). Remove the `#mode-label` rule and its
  mobile media-query override.

## Files touched

- `src/screens/hud/MoneyInfo.tsx`
- `src/screens/hud/TurnInfo.tsx`
- `src/screens/GameScreen.tsx`
- `index.html`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass (no game-logic changes).
- Manual: money panel shows 27px icons with no resource labels; the left-top box shows
  `"Mode. Turn N — Tribe"` and no separate mode label remains.
