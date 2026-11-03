# Tribe Color Update Design

Date: 2026-08-25

## Problem

The tribe colors don't match the intended palette for the new unit sprites.

## Decisions

Update `TRIBE_COLORS` in `src/config.ts`:

- Cats: `0xff69b4` → `0xa478c6`
- Villagers: `0x8b5a2b` → `0x813702`
- Warriors: `0xe07b22` → `0xd11515`
- Barbarians: `0xc0392b` → `0x424242`

## Files touched

- Modify: `src/config.ts`.

No tests reference `TRIBE_COLORS`; `tribes.ts` is the only consumer.

## Testing

- `npm run typecheck` and `npm test` must pass.
- Manual (`npm run dev`): village, ship, port, and skill-tree accents use the new
  tribe colors.
