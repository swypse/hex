# Weapon-specific attack sounds

Date: 2026-09-09

## Goal

Give combat feedback distinct audio per weapon instead of one generic impact:

- Play `arc-shot.wav` for any archer shot (the attacker is an archer), including
  shots that miss.
- Play `sword-hit.wav` instead of `hit.wav` for a successful (landed) attack by
  a swordsman or knight.
- All other landed attacks keep playing `hit.wav`, unchanged.

## Current state

- `public/sounds/` contains `arc-shot.wav`, `sword-hit.wav`, `hit.wav` and
  friends; the two new clips are already present.
- `src/sound/sfx.ts` maps a sound name to a `public/sounds/*.wav` file and
  caches one `Audio` element per name. It is used everywhere via `sfx.play`.
- Every non-missed attack event plays `hit.wav` in
  `src/controller/eventPresenter.ts` (`presentAttack`, ~line 313) when the
  attacker's or target's tile is visible to the local player. The clip fires at
  the start of the presentation, before the lunge animation (~160ms) that ends
  when the blow lands.
- `GameEvent['attack']` carries `attackerPre` (`AttackUnitPre`, always emitted
  by the simulator today) whose `type` is the attacker's `UnitType`.
- Missed attacks (other than a pending archer launch) play no sound.

## Design

### 1. Sound registry — `src/sound/sfx.ts`

Add two entries to the `FILES` map:

```ts
arcShot: 'arc-shot.wav',
swordHit: 'sword-hit.wav',
```

The existing `play`/cache behavior (retrigger by `pause()` + `currentTime = 0`)
is reused unchanged, so rapid multi-attack batches do not stack clips.

### 2. Sound-choice rule — new pure module `src/sound/attackSounds.ts`

A small, dependency-free helper that decides which clip(s) an attack event
needs. It keeps the mapping unit-testable without Pixi/DOM mocks:

```ts
export interface AttackSoundPlan {
  launch?: 'arcShot';   // fired the moment the attack starts
  impact?: 'swordHit' | 'hit'; // played when the blow lands
}

export function attackSound(
  attackerType: UnitType | undefined,
  missed: boolean,
): AttackSoundPlan;
```

Mapping:

| attacker type            | missed | launch  | impact      |
| ------------------------ | ------ | ------- | ----------- |
| archer                   | any    | arcShot | —           |
| archer                   | no     | arcShot | hit         |
| swordsman, knight        | no     | —       | swordHit    |
| swordsman, knight        | yes    | —       | —           |
| any other / unknown type | no     | —       | hit         |
| any other / unknown type | yes    | —       | —           |

Rules of thumb encoded here:

- Archery always makes a `launch` sound (the arrow flies whether it hits).
- An archer's landed shot also makes the generic `hit` impact on the target.
- `sword-hit` replaces the generic `hit` for sword-wielders (swordsman, knight).
- `undefined` attacker type degrades to the generic `hit` path (safety).

### 3. Presentation — `src/controller/eventPresenter.ts` (`presentAttack`)

The audibility gate is unchanged: a sound plays only when the attacker's or
target's tile is visible to the local player (`attackerVisible || targetVisible`).

Order of playback within `presentAttack`:

1. **Launch** — if the plan has a `launch`, play it immediately at the start of
   the attack presentation (covers archer hits and misses).
2. **Impact** — if the plan has an `impact`, play it when the attacker's blow
   visually lands:
   - In the full staged animation path (attacker visible, `attackerPre`/
     `targetPre` present): right after the attacker's `lungeUnit` resolves,
     alongside the `-hp` damage text — the blow lands ~160ms in.
   - In the non-staged fallback path (e.g. attacker tile not visible): play the
     impact at the attack start, preserving today's timing for these rare
     cases. Guard against double-play when the fallback also runs a lunge.

Misses by non-archers remain silent; the target's counter-attack inside the
same event stays unsounded (unchanged from today — one sound set per attack
event, driven by the attacker).

### 4. Out of scope

- No new sound channels / mixing / volume; `soundEnabled()` governs everything
  as today.
- Catapult, pirate, ship, warrior, rider, shield impacts keep `hit.wav`.
- No audio for archer *counter*-attacks (a surviving archer answering damage in
  the same event is not its own event).
- `hit.wav`, `arc-shot.wav`, `sword-hit.wav` files are already present; no asset
  work.

## Testing

- `tests/sfx.test.ts`: `soundUrl('arcShot')` and `soundUrl('swordHit')` match
  `sounds/arc-shot.wav` / `sounds/sword-hit.wav`.
- New `tests/attackSounds.test.ts` covering the mapping table: archer
  hit → `{ launch, impact: hit }`; archer miss → `{ launch }`; swordsman/knight
  hit → `{ impact: swordHit }`; their misses → empty; generic unit hit → `hit`;
  miss → empty; `undefined` type hit → `hit`.
- Existing combat/animation tests keep passing (none assert the current hit
  sound, so no fixtures change).
- `npm test` and `npm run typecheck` are green.

## Verification

- `npm test`
- `npm run typecheck`
- Manual smoke: in a game, an archer attack whooshes on every shot and thuds on
  a landed hit; a swordsman/knight landed attack clangs (`sword-hit`); warrior,
  catapult, etc. keep the old impact; turning Sound off silences everything.
