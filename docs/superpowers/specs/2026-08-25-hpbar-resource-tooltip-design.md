# HP Bar Position and Resource Tooltip Design

Date: 2026-08-25

## Problem

1. The unit HP bar and its `hp/maxHp` label sit too low on the unit sprite.
2. The resource icons in the top money panel give no explanation of what each
   resource is used for.

## Decisions

1. Move the HP bar, HP label, label background, and the action dot up 20px more
   (offset `-10` → `-30`).
2. Add a hover/click tooltip to the four resource icons (Money, Wood, Stone,
   Ore) showing the resource name and what it is required for.

## Section 1 — HP bar up 20px (`src/render/mapRenderer.ts`)

In `addHpBar`, change `const up = -10` to `const up = -30`. This shifts the
bar, the HP fill, the `hp/maxHp` label + its background, and the can-act dot
together.

## Section 2 — Resource tooltip

### Tooltip kit component (`src/ui/kit/tooltip.ts`)

Reusable `Tooltip` class:

- **Visual**: rounded box (`radius 6`), background `#000000` alpha `0.8`; a
  small triangle filled `#000000` alpha `0.8` on the top edge, tip pointing up.
  Content: title (resource name, bold) and a `Required for …` line.
- **Positioning**: appears below the hovered/clicked icon, centered on it, with
  the triangle tip at the icon's center x.
- **Behavior** (self-contained timers via `window.setTimeout`):
  - `pointerover` the icon → show after **500ms**.
  - `pointerdown` the icon → show **immediately**.
  - `pointerout` from the icon or the tooltip → hide after **500ms**
    (re-entering either cancels the pending hide).
  - `pointerdown` outside the icon and the tooltip (app-stage listener) → hide
    immediately.
- **API**: `constructor(stage)`, `mount(parent: Container)`,
  `showFor(target: Container, title: string, text: string)`,
  `hideAfter(ms: number)`, `hide()`, `destroy()`.
- Only one tooltip is ever visible per instance (the four icons share one
  instance in `HudMoney`).

### Tooltip content (`src/ui/hud/resourceTooltips.ts`)

```ts
export interface ResourceTooltipInfo {
  name: string;
  requiredFor: string;
}
export const RESOURCE_TOOLTIPS: Record<'money' | 'wood' | 'stone' | 'ore', ResourceTooltipInfo> = {
  money: { name: 'Money', requiredFor: 'spawning units, upgrading villages, building factories, mines and ports, opening skills, and upgrading ships.' },
  wood: { name: 'Wood', requiredFor: 'upgrading villages, building ports and roads, and upgrading ships.' },
  stone: { name: 'Stone', requiredFor: 'upgrading villages and building roads.' },
  ore: { name: 'Ore', requiredFor: 'spawning swordsmen, building ports, and upgrading ships to level 3.' },
};
```

The full tooltip text is `Required for ${requiredFor}`.

### HudMoney integration (`src/ui/hud/HudMoney.ts`)

- Construct one `Tooltip` and mount it on the widget's container; keep it
  visible across `update()` rebuilds (the current `update()` calls
  `removeChildren()`, so re-add the tooltip container after rebuilding icons).
- For each resource icon: `pointerover` → `showFor(icon, name, text)`;
  `pointerout` → `hideAfter(500)`; `pointerdown` → `showFor(...)` (immediate).

## Files touched

- Modify: `src/render/mapRenderer.ts`, `src/ui/hud/HudMoney.ts`.
- Create: `src/ui/kit/tooltip.ts`, `src/ui/hud/resourceTooltips.ts`.

## Testing

- New unit tests:
  - `tests/resourceTooltips.test.ts` — content shape for all four resources.
  - `tests/tooltip.test.ts` — with `vi.useFakeTimers()` and the existing
    `Image` stub: `pointerover` + 500ms shows; `pointerout` + 500ms hides;
    re-enter cancels the pending hide; `showFor` shows immediately.
- `npm run typecheck` and `npm test` must pass.
- Manual (`npm run dev`): HP bar/label sit 20px higher; hovering a resource
  icon shows the tooltip after 500ms, clicking shows immediately, moving off
  hides after 500ms, clicking elsewhere hides immediately.
