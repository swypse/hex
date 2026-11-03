# Tribe Special Units Design

2026-09-24

## Problem

Each tribe currently differs only by color, a starting money bonus, and an opening skill
(`tribes.ts`). This adds one **special unit per tribe**, available only to that tribe, with a
unique ability, following the existing unit/action/combat/UI patterns.

Special unit textures and spawn-button icons do **not exist yet** — use the tribe's
`*-warrior.png` for unit textures and `action-spawn-warrior` for the spawn popup icon until
real art is added later. The `action-stealth`, `action-stormcaller`, `action-build`, and
`cannonbal-32` textures already exist in their atlases.

## Approach

Flat `UnitType` expansion + narrowly-scoped capability hooks, mirroring how `pirate`, `bonus`,
and `bottle` were added. All 7 abilities share new engine primitives (see "Shared engine
primitives") before each unit's rule is layered on.

## New units (data)

| Type          | Tribe       | Move | Atk | Range | HP | Def | Cost          | Upkeep |
|---------------|-------------|------|-----|-------|-----|-----|---------------|--------|
| `stalker`     | Cats        | 12   | 30  | 1     | 60  | 0   | 9 money 2 wood | 3 |
| `builder`     | Villagers   | 8    | 10  | 1     | 50  | 0   | 7 money        | 2 |
| `banner`      | Warriors    | 8    | 20  | 1     | 60  | 8   | 10 money       | 3 |
| `berserker`   | Barbarians  | 10   | 50  | 1     | 70  | 12  | 11 money 3 ore | 4 |
| `trapper`     | Forest      | 10   | 20  | 1     | 50  | 8   | 9 money 2 wood | 3 |
| `stormcaller` | Aqua        | 20   | 20  | 1     | 50  | 8   | 9 money 2 ore  | 4 |
| `stunner`     | Sand        | 8    | 40  | 2     | 40  | 10  | 7 money        | 2 |

All seven shapes fall back to a drawn circle (`shape: 'circle'`).

## Data model changes

- `units.ts`: add the 7 `UnitType` values to the union, `UNIT_TYPES`, `UNIT_IMAGE_FILES`
  (each special type maps to `<tribe-code>-warrior.png` for every tribe), `UNIT_MOVE_POINTS`,
  `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`, `UNIT_MAINTENANCE`, `UNIT_TYPE_NAMES`. Extend the
  `Unit` interface with optional flags (below) and `makeUnit` defaults.
- `tribes.ts`: `TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType>` — the single tribe gate used by
  `spawnUnit`, the spawn dialog, and AI. Special units have **no skill requirement**.
- `spawn.ts`: tribe gate alongside the existing per-type skill gates.
- `score.ts`: `UNIT_SCORE` additions — stalker 9, builder 7, banner 8, berserker 10, trapper 8,
  stormcaller 9, stunner 7.
- `balance.ts` `PLAYABLE_UNITS`, `balance.ts` `UNIT_SKILL` (special units absent → no skill),
  `balance-report.ts` `CAPTION`, `baseline-data.ts` `units` (so the changes table does not
  crash).
- `unit-descriptions.ts` `LAND_KEYS`/`DESC_KEYS` + EN/RU i18n `unitType.*`, `help.<type>.*`,
  `spawn.*` reasons.
- `ai-patterns.ts`: tribe gate in `bestSpawnableUnitType`; add each special unit to
  `SPAWN_ORDER` per-tribe paths.

## New per-unit flags (all optional on `Unit`, cleared/synced at turn boundaries)

- `isStealthed?: boolean` — stalker.
- `firstMoveStealthDone?: boolean` — stalker: set once the spawn/first-move auto-stealth is used.
- `stunTurns?: number` — remaining turns the unit is stunned; ≥1 means stunned.
- `auraAttack?: number` — cached effective-attack bonus for HP-bar icons, refreshed at the
  owner's turn start.

## New tile state

- `MapTile.trap?: { owner: number; placedTurn: number }` — trapper's thorn trap.

## Shared engine primitives (`src/game/abilities.ts`)

- `bannerAttackBonus(map, unit, playerIndex)`: +10 for a unit within hex distance ≤2 of a
  **friendly banner, excluding the banner itself**; non-stacking (flat +10 from any number).
- `berserkerRage(unit)`: +20 atk while `hp <= maxHp / 2` (≤50%).
- `effectiveAttack(map, unit)`: base attack (ship stats if on a ship, else `UNIT_TYPES`) plus the
  two bonuses.
- Suppress counter-attack when `berserkerRage(unit)`.
- Stun suppression: while `stunTurns > 0` the unit cannot move/attack/heal/capture/build
  (`canMove`, `canAttack`, `canHeal`, `unitCanAct`, toolbar gating all return false).

## Combat integration (`combat.ts`)

- `attackDamage` / `resolveCombat` attacker force and damage use `effectiveAttack`.
- Stealthed attacker → target defense treated as **0** for that hit.
- A raging berserker provokes no counter-attack.
- `chooseBestAttack` / AI scoring use `effectiveAttack`.

## Stalker (Cats) — stealth

- Spawned **visible** so opponents see the stalker enter play.
- **First move auto-stealth**: when the stalker moves while `!isStealthed &&
  !firstMoveStealthDone`, set `isStealthed = true` before the move animation starts (opponents
  never see it move) and set `firstMoveStealthDone = true`. Moving while already stealthed keeps
  stealth. Later moves while visible do not re-stealth.
- **Enable stealth button** (`action-stealth`): when selected, not stealthed, and has actions;
  sets `isStealthed = true` and consumes all actions (`hasMoved/hasAttacked/hasHealed = true`).
  Emits `stealthEnabled`.
- **Attack from stealth**: target defense = 0 for the hit; after the attack resolves
  `isStealthed = false` (visible to all). Counterattack is still possible.
- **Bump reveal**: when an enemy move path would step onto the stealthed stalker's cell, the move
  is canceled before entering, `isStealthed = false`. The enemy stays on the previous path cell;
  if that was the first step (stalker on the first cell of the path) the enemy keeps its move
  action and may move again, otherwise the move is consumed normally.
- **Visibility** (opponent view): stealthed stalkers are excluded from map sprites, attackable
  targets, attack markers (even if in range), `isAdjacentToEnemy` pathing, AI visible-enemy list
  and enemy-power sums, and opponent move/path animation. The owner still sees its own (slightly
  dimmed) stealthed stalker and its moves.

## Builder (Villagers) — building

- On an owned tile (not a ship), a builder with actions left sees the **build** button
  (`action-build`), which opens a popup of the four kinds: sawmill, mine, port, bridge.
- Selecting a kind highlights the eligible cells: the builder's own tile or any adjacent tile
  within the building's normal placement rules (mine→mountain, sawmill→land adjacent to forest,
  port→water adjacent to own land, bridge→water between two land hexes), owned by the player and
  within village building capacity.
- Clicking an unhighlighted cell cancels. Clicking a highlighted cell pays the building's normal
  cost, places it, consumes the builder's turn, and emits the existing `built` event.
- The skill requirement is **waived** for builder-built buildings; placement terrain/territory
  constraints and costs are unchanged. On a ship the build button is hidden (no building from
  ships).
- Implementation: the existing `build` command gains an optional `unitId`; when present the skill
  check is skipped, the ±1-hex reach + unit-turn-consumption rules apply. Non-builder builds keep
  today's behavior unchanged.

## Banner Bearer (Warriors) — war cry

- Passive, no command. Friendly units (excluding the banner itself) within distance 2 get +10 atk
  via `bannerAttackBonus`, non-stacking. When the banner dies the bonus disappears automatically
  (computed live).
- Recipients render an `attack-16` 16px icon + `+10` text right after their HP bar (see Rendering).

## Berserker (Barbarians) — rage

- Passive. At ≤50% hp the berserker gets +20 atk (`berserkerRage`) and provokes no
  counter-attack. Displayed as `attack-16` icon + `+20` text after the HP bar.

## Trapper (Forest) — thorn trap

- **Placement**: toolbar **build thorn trap** (`action-build` for now) when a trapper with actions
  is selected on a land tile and not on a ship. Clicking highlights eligible cells: the trapper's
  tile + adjacent cells that are non-water, not occupied by a unit/settlement/building, not
  already trapped, and owned by the player. Clicking a highlighted cell pays **5 money + 3 ore**,
  places `trap`, consumes the turn, emits `trapPlaced`; clicking elsewhere cancels.
- **Render**: 8px red circle at hex center, visible only to the owner (`trap.owner ===
  localPlayerIndex`).
- **Expiry**: removed when `turn >= placedTurn + 5` (placed on N, present through N+4) — checked
  at the owner's turn start and on trigger.
- **Trigger**: during move application, stepping onto a trap cell stops the move there
  (`hasMoved = true`), removes the trap, and deals ~90 damage (attacker: atk 60, full HP, defense
  0 — no miss, no counter). Emits `trapTriggered`.

## Stormcaller (Aqua) — storm

- **Eligibility**: the stormcaller stands on an owned cell (land, or a ship on the village's
  owned water tile) belonging to a village whose claimed area has ≥1 water tile. Shows the
  **storm** button (`action-stormcaller`).
- Clicking consumes the stormcaller's whole turn and emits `storm`: every **enemy or pirate
  ship** on the water tiles claimed by that village takes ~90 damage (attacker atk 60, full HP,
  defense 0 — no miss, no counter). Own ships are never hit. A village with no ships still shows
  the button and the storm does nothing.

## Stunner (Sand) — stun

- Range-2 target → always stun. Range-1 target → prompt (**Attack** / **Stun**); regular attack
  behaves like a warrior attack.
- Stun: 10% miss roll (Science reduces as usual). On hit: **no HP damage**. If the target has
  already acted this turn it is blocked next turn, otherwise it is blocked for the rest of this
  turn. Mechanically: set `stunTurns = 1` when the target already acted, `stunTurns = 2` when it
  has not; `stunTurns` decrements at the target owner's turn start and `stunTurns ≥ 1` ⇒ stunned.
  Stunned targets provoke **no counterattack**. A stunned unit's HP text appends `"stunned"` (map +
  selected HUD).
- Animation: `cannonbal-32` texture arcs to the target like a bow arrow.

## UI / rendering

- `spawn-dialog.ts`: list base units (skill-gated) + the player's tribe special unit; special
  units use the `action-spawn-warrior` icon until real icons exist; `reasons()` gains the tribe
  check.
- `toolbar-specs.ts`: stealth, build (builder), thorn trap, storm buttons per the sections above;
  stun prompt for range-1 stunner attacks.
- `map-renderer.ts`: hide stealthed stalkers from opponents; dim for owner; draw owner-only trap
  markers; aura/rage icons (`attack-16` + `+10`/`+20` text) after HP bars; `"stunned"` suffix.
- New `GameEvent`s: `stealthEnabled`, `trapPlaced`, `trapTriggered`, `storm`, `stunShot`; new
  `Command`s: `enableStealth`, `trap` (+ builder `build` with `unitId`). Presenter cases animate
  each (projectile arcs, trap pop + damage text, storm flicker on affected ships, buff-icon
  refresh).
- New unit stats are displayed through the existing map/HUD icon pipelines
  (`unit-descriptions.ts`, `icons16`).

## AI

- `bestSpawnableUnitType` respects the tribe gate; `SPAWN_ORDER` gains each special unit for its
  tribe.
- Basic ability use only: stalker enables stealth when idle at turn start; stormcaller storms when
  its village's water tiles hold ≥1 enemy/pirate ship; berserker and stunner benefit automatically
  through the combat hooks. Builders do not use the build popup; trappers do not place traps yet.

## Tests

Unit-level coverage per module: units stats/names/upkeep, spawn tribe gating, stealth
(visibility/exclusion, first-move auto-stealth, bump reveal, defense-0 attack), banner aura
(bonus, exclusion of self, no stacking, death clears), heat-tested berserker rage (bonus at ≤50%,
no counter, threshold), traps (placement rules, expiry, trigger damage/stop), storm (eligibility,
enemy/pirate-only damage), stun (prompt routing, miss, suppression flags, `"stunned"` text),
toolbar specs, combat integration, balance-report regeneration, AI spawn gates, spawn-dialog
filtering, HP-bar buff icons. Existing tests that assert exact spawn-dialog item counts / row
counts are updated for the new playable unit count.

## Docs

`GAME.md`: add the special units to the Units table, note per-tribe gating, and describe each
ability under Unit actions. `combat-balance.md`: mention aura/rage/stun/trap/storm in the balance
text. The balance report is regenerated.