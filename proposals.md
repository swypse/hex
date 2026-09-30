# Proposals: more variety and repeated decisions

Goal: a turn should keep offering new choices from turn 1 to turn 30. This is a proposal document — nothing here is
implemented. Written 2026-09-30 from a read of `GAME.md`, `src/game/{events,bottles,bonus,buffs,resources,village}.ts`
and the balance work in [`unit-balance-report.md`](unit-balance-report.md).

## 1. Diagnosis: why turns feel the same

What a player actually does today, in order of frequency:

1. **Move / attack / heal units.** This is the only action that repeats every turn, and it varies little because unit
   roles are fixed (see the balance report: warrior/archer mass is the best value).
2. **Spawn** while money allows. One decision per village, made mostly on cost.
3. **One-off purchases:** skills (17 total, each bought once), village upgrades, roads, bridges, buildings, ships. Each
   is bought once and never revisited; after the tree is bought there is nothing to spend on.
4. **Nothing to manage over time.** Income is a passive `3 + 2×level − upkeep` per village at the end of the round.
   Buildings produce +1 of something; there is no shortage, surplus, decay, or upkeep pressure other than money.

Structural gaps behind that:

- **One real resource.** Wood/stone/ore only feed one-off costs. Nothing can run out, spoil, or be traded, so no
  choice ever repeats ("do I have enough food for this army?").
- **The world is static.** Terrain, resources and ownership only change through player actions. The only random
  world events are pirates (from turn 7, 15% on odd turns), bottles and the initial bonus hexes — all one-shot pickups.
- **No reactive play.** Nothing happens *to* the player that must be answered. Every turn is the player's own plan.
- **Little asymmetry.** Tribes differ by a start bonus and one special unit; every game runs the same opening.
- **Placeholders.** Several skills say "future features" (Water temples, Forest temple) or "coming soon" (Defense /
  village walls), and mines/sawmills give tiny rewards.
- **No unit growth.** A unit is identical on turn 1 and turn 25, so there is no reason to protect or plan around a
  particular unit.

Design principle for everything below: **each new system must create a decision that comes back every few turns, have a
visible warning before it hurts, and have a counter the player can use.** A random hit with no reaction is noise, not
variety.

## 2. Proposals

Effort: S (days), M (about a week), L (multi-week, touches AI + balance + UI). Impact is the expected effect on
"turns feel different".

### A. Random world events with warning (impact: high, effort: M) — start here

A small event system that rolls at the start of each round and shows a **forecast one round ahead** ("Omen: Drought in
2 turns, north-west"), so players can react. Reuses the pirate/bottle spawn pattern (seeded RNG on the host so
multiplayer stays in sync).

Candidate events (each has a counter):

| Event | Effect | Player reaction |
|-------|--------|-----------------|
| **Harvest festival** | Villages in one biome produce +2 money for 2 turns | Move units/expand there; short-lived race |
| **Drought** | Grassland/Desert villages −2 income (or farms −50%) for 3 turns | Build a granary, switch to ports/fishing, or hold reserves |
| **Plague** | Units in one area lose 10 HP/turn while there | Pull back; a temple/hospital shields it |
| **Flood** | Coastal land tiles become water for 2 turns; units on them are stranded | Move out; ships gain access |
| **Wildfire** | A forest cluster burns (becomes land, wood lost) | Cut it first with *Extract forest* for wood |
| **Earthquake** | A mountain tile collapses or opens a new pass | Climbing/Smithery plans change |
| **Merchant caravan** | A neutral trader walks between two villages; a unit standing next to it may buy (money → resources) | Race to escort or intercept |
| **Mercenaries for hire** | An offer at one village: a strong unit for a discount, one-turn window | Spend or save |
| **Rebellion** | A village with high upkeep or no food (see B) turns neutral unless a unit stands on it | Garrison it or lower upkeep |
| **Meteor** | Ore/stone deposit appears on a free tile (bonus-hex style) | Contest it |
| **Storm** | Ships in a region lose 10 HP and cannot move | Return to port |

Rules to keep it fair: a max of one active event per player region; a catch-up bias (the trailing player is more likely
to receive the beneficial event, the leader the harmful one); a per-game toggle ("Events: off / mild / wild") on the
setup screen so competitive matches can turn it off. Score: small bonus for surviving/mitigating an event (e.g. +5).

Where it plugs in: a new `src/game/world-events.ts` with a per-round hook where pirates/bottles are already rolled;
a new `GameEvent` variants in `events.ts` for the presenter; forecast text in the HUD turn banner. AI needs simple
rules ("garrison if rebellion forecast", "move out of flood zone") — start with the three or four cheapest events.

### B. Food, population and farming (impact: high, effort: L)

The suggested economy layer. Keep it small enough that the AI can play it.

- **Food** becomes the fifth resource (money, wood, stone, ore, **food**). Each village has a food balance:
  `food production − population upkeep`, where **population** is the units it supports plus a base per village level.
- **Farm** (new building, needs a new skill, e.g. *Agriculture* — level 1, no parent): placed on land, produces +2
  food per level; better on grassland/rainforest, poor on desert/tundra. Adjacent farms give a small bonus (a reason to
  cluster). **Fishing** on port/water tiles and **hunting** near forests produce food too, so the biome and ports
  matter.
- **Granary** (new building, unlocks after Farm): stores up to `N` food so short shortages and droughts can be
  bridged. This is the "reserve" decision.
- **Starvation:** a village with negative food and an empty granary first pays extra upkeep in money, then its units
  lose 5 HP per turn ("hunger") and may desert after 3 turns; a village at level ≥2 shrinks by one level if it
  starves for 5 turns. The pain is gradual so the player always has time to react.
- **Unit food cost** replaces part of the money upkeep: warrior 1, archer/rider 1, swordsman 2, knight 2, catapult 2
  (heavy units eat more). Tune so an army of 8 needs about 3 farms.
- **Growth:** surplus food (with a granary) raises village population; each growth step is a choice: **+1 unit capacity
  or +1 income** (a repeating decision every few turns).
- **Raiding:** an enemy unit that stands on a farm tile for a turn burns it (free action, costs the attacker tempo).
  Farms and granaries become real targets and reasons to defend, not just villages.

Why this helps: it creates a recurring background to every turn ("am I feeding this army?"), links map position to the
economy, and gives war a new lever (starve them out) besides "kill units".
Risks: heavy AI/tutorial/balance work; must be explained in the UI (a food line in the resource bar and a village
tooltip breakdown); watch the snowball — a leader with more farms should not starve everyone else. A simpler first
step is to ship only Farm + granary + a soft penalty (extra money upkeep) without desertion.

### C. Trade and a market (impact: medium, effort: M)

- **Market** building: convert resources at fixed rates with a per-turn cap (e.g. 2 wood → 3 money, 3 money → 1 ore).
  Turns the currently fixed 1:2 exchange constants into a player-facing decision and lets a player fix a resource gap.
- **Trade routes:** road/port links between two of your villages already exist; make a route pay
  `+1 money per 3 hexes of length` and expose it to raids (pirates and enemy units cutting the road). Long routes
  become a risk/reward choice instead of an automatic bonus.
- **Prices vary:** events (A) shift prices ("ore shortage: ore ×2 for 3 turns"), rewarding stockpiling.

### D. Neutral camps and map objectives (impact: high, effort: M)

Adds reasons to fight something other than the opponent.

- **Neutral camps** (barbarians, bandits, monster nests) on the map from the start, guarding a reward: resources,
  a free skill, a bonus unit, or a village. They are stationary, tough, and do not chase. Clearing one is a mid-game
  task that needs a group and repeats as new camps respawn every ~8 turns in cleared areas.
- **Points of interest:** ruins (hold for 3 turns → skill), lighthouse (extends vision, shortens ship routes), shrine
  (heals units that stand on it), watchtower ridge (+1 vision). These are not tile decoration — they change where
  players go.
- **Escalating pirates:** after turn 15 pirate spawns come in pairs or with a stronger ship; deals cost more. The
  existing 50-money deal becomes a recurring decision instead of a rare one.
- **Round objectives:** each game a shared list of 2–3 goals ("first to connect two villages by road", "hold the central
  ruins at turn 15", "most kills by turn 10") with a score reward. Objectives change the plan from turn 1 and give
  the trailing player something to catch up on. Present them at game start alongside the win condition.

### E. Village specialization (impact: medium, effort: M)

Today upgrading a village is a pure number increase. Make it a choice.

- At level 2 and 4 a village picks **one of two perks** (permanent, visible on the village):
  - *Barracks:* +1 unit capacity, or first spawned unit of a turn is 1 gold cheaper.
  - *Trading post:* +2 money, or −1 upkeep for units it raised.
  - *Stronghold:* wall built for free, or +2 defense to units inside.
  - *Farmland / Foundry (with B):* +2 food, or +1 ore/stone per turn.
- Building slots (1/2/3/4 per village level) already exist; add buildings so those slots are a real choice, not "sawmill
  or mine": **Barracks** (heal +10 extra), **Infirmary** (units in the village heal 25), **Watchtower**, **Market**,
  **Granary**, **Farm**.
- Finish the placeholder skills: **Water temple** and **Forest temple** should have concrete effects (they already grow
  and give buffs), and **Defense** (village walls) is already marked "coming soon".

### F. Unit experience and heroes (impact: medium, effort: S–M)

- Units gain XP for kills and for surviving battles; at 1 and 3 kills they can be promoted (**+2 attack**, **+10 HP**, or a
  small trait: first strike, +1 move, counter ×1.25). The choice of promotion is a repeated small decision.
- A promoted unit is worth protecting, which makes retreating and healing matter (heal exists but is rarely a good
  action today).
- **Heroes** (one per player, rare): a named commander who gives an aura (like the banner) but can be lost for good;
  losing it costs score. It gives every game a story.
- Balance note: keep XP bonuses small; the balance report showed damage snowballs with HP, so +attack must be capped.

### G. Seasons and the changing map (impact: medium, effort: M)

A 6-turn season cycle (spring → summer → autumn → winter) shown in the HUD:

- **Winter:** water tiles next to the shore freeze and become walkable (ships cannot sail), forest movement +2,
  unit food/upkeep +1; **Summer:** drought risk higher; **Autumn:** harvest bonus (+1 food/money for farms); **Spring:**
  floods.
- Each season *reverses* some advantages (naval vs land), so the plan changes every few turns without new units.
- Cheap variant: only "winter" (turns 10–14 and 20–24) freezing shallow water; this alone opens new attack routes.

### H. Diplomacy (impact: medium, effort: M)

- Ceasefire and non-aggression offers (AI can propose them when it is losing); breaking one costs score.
- Tribute: an AI or a human can pay money each turn for peace with the pirates (already exists as a one-time deal).
- Multiplayer: shared vision and alliances; the winner rules already choose one winner by score, so alliances need a
  team-score rule.

### I. Stronger tribe identity (impact: medium, effort: S–M)

- Give every tribe a passive trait alongside the start bonus: Cats (+1 vision), Villagers (+1 money per village, farms
  +1), Warriors (banner within 3), Barbarians (wounded units +1 attack), Forest (units heal +5 in forest), Aqua (ports
  cost −5), Sand (desert tiles cost no extra move; drought immunity).
- Tribe-specific building: e.g. Aqua's fish market, Forest's druid grove, Sand's oasis well.
- Different opening pressure per tribe means AI and player enter turn 1 with distinct plans.

### J. Tech that changes how you play, not just what you can buy (impact: medium, effort: S)

- Convert some skills from "unlock X" into **modifiers**: e.g. *Roads* also lowers trade-route cost, *Science* also gives
  +1 vision or reveals events one turn earlier, *Defense* walls last one turn longer.
- Add a second row of skills gated on resources other than money (e.g. *Fortification* needs stone, *Alchemy* needs ore),
  so the currently unused stone and ore have a sink.

## 3. Recommended order

| Order | Item | Why first | Rough scope |
|-------|------|-----------|-------------|
| 1 | **A. Events with forecast** (start with flood, drought/harvest, mercenaries, plague) | Biggest jump in "something happens" for the smallest system change; reuses pirate/bottle plumbing | `world-events.ts`, event variants, HUD forecast, 3–4 AI reactions, tests |
| 2 | **D. Neutral camps + objectives** | Gives mid-game a goal other than the opponent; simple AI (attack camp if strong enough) | camp unit type / owner `-2`, spawn in `map-gen.ts`, capture-like reward, objective list |
| 3 | **E. Village specialization + placeholder skills** | Turns upgrades into repeated choices; the placeholder skills already exist | perk data in `village.ts`, UI popup, AI picks by personality |
| 4 | **F. Unit XP** | Small, self-contained, makes fighting/healing meaningful | `Unit.xp`, promotion popup, balance re-run |
| 5 | **B. Food & farming** (soft version first: Farm + granary + extra upkeep) | The big rework; do after A–E so the events (drought/plague) can plug into it | new resource, buildings, AI economy rules, tutorial text |
| 6 | **G. Seasons**, **C. Market/trade**, **H. Diplomacy**, **I. Tribe traits**, **J. Tech modifiers** | Add independently as balance and time allow | — |

## 4. Cross-cutting requirements

- **Determinism:** multiplayer rolls happen on the host with the shared seed; the presenter only reads `GameEvent`s.
- **AI:** every new system needs a minimal AI policy in `ai-*.ts` (garrison, retreat, farm, clear camp) and an entry in the
  AI bench (`tools/ai-bench.ts`). The bench only resolves about 4-point effects (see memory *AI bench noise floor*), so
  measure with several hundred games.
- **Balance:** re-run `npm test` and read `combat-balance.md` after any stat change; extend `balance.ts` with the new
  effects (XP, banner-like auras) before tuning. Event tuning needs a simulation over 200+ games to check that no event
  decides the winner alone (catch-up bias helps).
- **Readability:** every new mechanic needs a HUD line, a tooltip, a help-text entry (`help-texts.ts`) and a tutorial step
  if it appears before turn 10. The forecast banner should be visible for at least one full turn before impact.
- **Opt-out:** setup-screen switches (events, neutral camps, food) so ranked/competitive rooms can keep the current
  rules; treat the old rules as "classic mode".
- **Scoring:** any new resource or objective should have a small score hook, otherwise players ignore it in "30 Turns" mode.

## 5. Open questions for the game designer

1. Should events be per-region (interesting, needs localised UI) or global (simple, less tactical)? Recommendation:
   region-based, with three regions per map at first.
2. Is starvation allowed to *kill* units and shrink villages, or only to cost money? Recommendation: money + HP loss,
   never instant death; deserters only after a long famine.
3. Should neutral camps respawn? Recommendation: yes, slowly, so mid-game keeps a supply of goals.
4. Is "classic mode" (current rules) a requirement for existing multiplayer rooms and the tutorial?
5. How much of the new content should the tutorial explain (it currently covers banner/stalker actions)?
