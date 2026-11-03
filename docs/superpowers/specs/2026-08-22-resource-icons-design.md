# Resource Icons in Money Panel Design

Date: 2026-08-22

## Problem

The money/resources panel (`src/screens/hud/MoneyInfo.tsx`) shows a star glyph for money
and small colored squares for wood, stone, and ore. Four new 64×64 PNGs were added to
`public/textures/` (`coin.png`, `wood.png`, `stone.png`, `ore.png`) and should replace the
star and square icons.

## Design

In `src/screens/hud/MoneyInfo.tsx`, replace the star/squares with `<img>` tags pointing at
the new images. Add a shared icon style:

```ts
const iconStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 18,
  height: 18,
  marginLeft: 8,
  marginRight: 4,
  verticalAlign: 'middle',
};
```

Replace the icons:

- Money: `⭐ {money}...` → `<img src="/textures/coin.png" style={iconStyle} alt="money" /> {money}...`
- Wood square (`background: '#8b5a2b'`) → `<img src="/textures/wood.png" style={iconStyle} alt="wood" />`
- Stone square (`background: '#9a9a9a'`) → `<img src="/textures/stone.png" style={iconStyle} alt="stone" />`
- Ore square (`background: '#555'`) → `<img src="/textures/ore.png" style={iconStyle} alt="ore" />`

The existing `squareStyle` const is removed. Text, income `(+N)` annotations, and layout
stay unchanged.

Vite serves `public/` from the site root, and tile images already load from
`/textures/...`, so this matches the existing pattern.

## Files touched

- `src/screens/hud/MoneyInfo.tsx`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass (no game-logic changes).
- Manual: the money panel shows coin/wood/stone/ore images next to their counts and income
  annotations.
