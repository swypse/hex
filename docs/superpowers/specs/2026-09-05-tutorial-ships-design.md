# Tutorial Ships — Design

Date: 2026-09-05
Status: Approved (in brainstorming) — pending implementation plan

## Summary

Extend the existing tutorial with a **naval segment**. The fixed tutorial map gains an **east sea** with the village on a coast, and after the existing Archer combat lesson the tutorial teaches: upgrading the village to level 3, opening Water + Navigation, building a port, boarding a ship, upgrading the ship, and fighting an enemy ship. The existing "Basic tutorial complete" end dialog stays as the terminal step.

This doc extends `docs/superpowers/specs/2026-09-05-tutorial-mode-design.md`; everything in that spec still applies (permissive play, skip-if-done steps, non-blocking banners, pulse highlights, save gating) unless changed here.

## Decisions (agreed in brainstorming)

- **Q1 – which unit boards:** the **starting Warrior**. When the ship segment reaches the boarding step, the director repositions the Warrior to a free land tile adjacent to the port (if it isn't already close enough) so the lesson is always solvable.
- **Q2 – naval fight:** a single attack by the player's ship (hit or miss) completes the step, consistent with the Archer lesson. The enemy ship never moves and is removed at the final end step.
- **Q3 – building slot:** the port is a third building, so the ship segment begins with an explicit **"Upgrade village to level 3"** step (Upgrade button pulsed) before the port can be built.
- **Q4 – map:** tutorial disc enlarged to **radius 5**; the village sits on an east coast with the port tile right next to the capital; open water stretches east so the enemy ship can sit exactly 3 hexes away while staying on interior (non-edge) tiles (no pirates).

## Map rework (`src/game/tutorial/tutorialMap.ts`)

- `TUTORIAL_RADIUS = 5`. Every tile at ring distance 5 from the origin stays land, so pirate spawning is impossible.
- Village `(0,0)` on a coast. Water tiles (east bay): `(1,0) (2,0) (3,0) (4,0)`. `(1,0)` is the port build tile — distance 1 from the capital, already owned at level 1, adjacent to land staging tiles.
- Land lessons keep their spots (adjusted where the sea overlaps decorative variety):
  - `(1,-1)` land — Warrior parking / boarding staging tile.
  - `(-1,1)` forest, `(0,1)` sawmill tile (land adjacent to the forest).
  - `(2,-2)` mountain — mine tile (distance 2, inside the level-2 claim).
- The Archer practice enemy now appears to the **west** (preferred `(-3,1)`), attacked from the walkable forest tile `(-1,1)`; its old tile `(2,1)` is no longer reserved.
- All coordinates shared with the director/steps move to exported constants in this module (e.g. `TUTORIAL_PORT_TILE`, `TUTORIAL_ARCHER_ENEMY_PREFERRED`, `TUTORIAL_SHIP_ENEMY_PREFERRED = { q: 4, r: 0 }`, `TUTORIAL_WATER_TILES`).
- Starting resources raised so every purchase in the full tutorial is affordable with no grinding: `{ money: 250, wood: 60, stone: 60, ore: 30 }`.

## Step sequence additions

`STEP_ORDER` grows. After the existing `attackEnemy` (Archer) step, and before the terminal `end`:

| Step id | Instruction | Completes when |
|---|---|---|
| `upgradeVillage3` | "Your village is at its building limit. Select it and press the pulsing Upgrade button (4 wood + 2 stone + 4 money) to make room for the port." (`toolbarKey: 'upgrade'`, marker `(0,0)`) | Capital level ≥ 3 |
| `openWaterNavigation` | "You need Water, then Navigation, to build a port and sail. Both are highlighted in the skill tree." (skills button pulses; highlights `water`, `navigation`) | Human has both skills |
| `buildPort` | "Select the highlighted water tile and press the pulsing Build port button (10 wood + 30 money + 2 ore)." (`toolbarKey: 'port'`, marker `(1,0)`) | An owned `port` building exists |
| `boardShip` | Director first repositions the Warrior to a free land tile adjacent to the port. "Move your Warrior onto the port to turn it into a ship." (markers: port tile + Warrior) | An own unit on the owned port has `shipLevel === 1` |
| `upgradeShip` | "Select your ship and press the pulsing Upgrade Ship button (8 money + 4 wood)." (`toolbarKey: 'upgrade-ship'`, marker on the ship) | An own ship has `shipLevel >= 2` |
| `attackEnemyShip` | Director places the enemy ship (dummy `shipLevel: 1` unit) on the first free water tile at distance exactly 3 from the ship (prefer `(4,0)`). "An enemy ship appeared. If your ship cannot act yet, end your turn; then sail within range and attack — a ship may move then attack in one turn. It will not move." (markers: ship + enemy) | The player's ship attacks the dummy ship (hit or miss) |
| `end` | Existing "Basic tutorial complete" dialog + **Return to main menu**. Director removes all remaining dummy units. | Button clicked |

Notes:

- The defeated Archer-step Warrior (dummy) is removed by the director when entering `upgradeVillage3`.
- Because a freshly converted ship has `hasAttacked = true` (boarding), it cannot act until the next round; the `attackEnemyShip` banner explains this and persists across the required End Turn, mirroring the Archer lesson. Upgrading is allowed in the same turn as boarding (no `hasAttacked` gate).
- The two attack lessons are distinguished by attacker kind: `archer` (land) vs `ship` (`shipLevel` defined).

## Director changes (`src/controller/tutorialDirector.ts`)

- New step ids handled in `done()` / `completesOnEvents()` as above.
- Side effects on entering a step:
  - `upgradeVillage3` → remove the Archer-step dummy Warrior.
  - `boardShip` → reposition the Warrior: if no own unit stands on a land tile adjacent to the owned port, move the Warrior (owner 0, id `TUTORIAL_START_WARRIOR_ID`) to the first free land tile adjacent to the port; clear its old tile; keep `spawnVillage` and flags.
  - `attackEnemyShip` → place the enemy ship on the first free water tile (`TUTORIAL_WATER_TILES` membership or `isWaterType` + free) at distance exactly 3 from the ship, preferring `(4,0)`.
  - `end` → remove every unit owned by the dummy player.
- Attack-step conditions: `attackEnemy` requires attacker type `archer`; `attackEnemyShip` requires attacker `shipLevel !== undefined`; both require target owner = dummy.

## UI

No new widgets. Existing infrastructure is reused:

- `STEP_CONFIG` gains the new steps (dialog/banner copy, `markers`, `toolbarKey`, `highlightSkills`, `pulseSkillsButton`, `highlightEndTurn`); `stepCounter` `M` grows automatically.
- Toolbar pulses: `upgrade` (level-3), `port`, `upgrade-ship`.
- Skill-tree halos for `water` and `navigation`; skills-button pulse during `openWaterNavigation`.
- Hex markers: port tile, ship/enemy ship (found dynamically on the map like the Archer enemy), Warrior during boarding.

## Robustness / edge cases

- **Pirates:** no ring-5 water, so `trySpawnPirate` never fires.
- **Skip-if-done:** if the player already opened Water/Navigation, built a port, boarded, upgraded, or the enemy died, the affected steps auto-advance exactly like the existing steps.
- **Soft-locks:** the only genuinely irreversible case is a player who fills all four building slots (requires deliberately upgrading the village to level 4+ and building extra buildings) before the port — out of scope for a guided tutorial and already prevented in practice by the immediate post-upgrade prompt.
- **Resources:** enriched starting stash covers every purchase; required income demos remain unchanged.

## Testing

- `tutorialMap.test.ts`: radius 5; no ring-5 water; east water present including a tile at distance ≤ 2 from the capital; port/boarding/land tiles keep their required terrain and claims; ring-5 all land; feature coordinates exist.
- `tutorialSteps.test.ts`: order is `welcome` → `end` and now includes the seven new ids; per-step config/fields valid; `toolbarKey`/highlight skills refer to real keys/skills.
- `tutorialDirector.test.ts`: the full happy path drives through all steps to `end` (move → upgrade lvl2 → forestry → end-turn ×2 → sawmill → climbing/smithery → mine → spawn archer → archer attacks → upgrade lvl3 → water/navigation → build port → board → upgrade ship → ship attacks → end), asserting side effects (enemy Warrior removed, Warrior repositioned next to the port, enemy ship placed on water at distance 3, ship removed at end). Plus a repositioning case and a ship-placement fallback case.

Manual checklist: loading → full land tutorial → Archer lesson → banners continue into village lvl3 → skill tree halos for Water/Navigation → Build port pulse on `(1,0)` → Warrior auto-staged beside the port → boarding turns it into a ship → Upgrade Ship pulse → enemy ship appears 3 hexes away on water, never moves → sail & attack → final end dialog returns to menu; no "Resume" entry; existing real-game saves untouched.
