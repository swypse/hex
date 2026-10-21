# Proposals

Not implemented yet. Implemented or partly implemented ideas (random weather events, food/farming, seasons, trading,
veterans, village upgrade choices, temples/walls, skill modifiers) were removed. Design rule: each system should create
a decision that returns every few turns, show a warning before it hurts, and give the player a counter.

## 1. Neutral camps and raiders (best fit)

- **Wild camps:** stationary, tough neutral units (owner `-1`) guarding a bonus or free village; they do not chase.
  Reward: gold, a veteran, a skill discount or a village. Camps respawn slowly (~8 turns) in cleared areas.
- **Roaming raiders:** a winter wolf pack that raids farms; a bandit band that follows roads and burns them (reuses the
  road-cutting logic). The land counterpart of pirates.
- **Map-centre boss:** a strong neutral the leader fights for a big prize.
- **Escalating pirates:** after turn 15 they come in pairs or stronger; deals cost more.
- **Why:** gives mid-game targets other than the opponent, and simple AI (attack a camp if strong enough).
- **Cost:** medium (spawn rules in `map-gen.ts`, neutral AI, balance).

## 2. Quests and objectives

- 2-3 optional goals per player per game or season: "capture a village before turn 20", "build a port", "kill 3
  pirates", "hold 2 temples". Rewards: gold, a one-off skill discount, a veteran.
- Shared competitive goals: the first to reach a landmark or connect two villages by road gets the prize; they give the
  trailing player something to catch up on.
- **Why:** adds direction without changing core rules; achievements already track most conditions.
- **Cost:** low to medium (goal definition list + UI).

## 3. Map features to contest

- Ruins (hold 3 turns → free skill), wonders (+income / +vision), lighthouse (vision, shorter ship routes), shrine
  (heals units on it), watchtower ridge (+1 vision). Mountain passes and bridges as chokepoints.
- Cheap with the bonus-placement code; gives the AI clear targets.

## 4. Remaining random events

On top of weather: harvest festival, travelling merchant, mercenaries for hire, refugees (free unit), plague, flood,
wildfire, rebellion of a starving/high-upkeep village, meteor ore deposit. Choice events ("spend 10 gold to avert it").
Forecast one round ahead, host-side seeded RNG, catch-up bias, setup toggle (off / mild / wild).

## 5. Diplomacy

- Ceasefire and non-aggression offers (AI proposes when losing); breaking one costs score.
- Multiplayer alliances and shared vision (needs a team-score rule).
- **Cost:** high (AI behaviour, UI, abuse cases).

## 6. Stronger tribe identity

- Passive traits next to the start bonus: Cats +1 vision, Villagers +1 money per village, Warriors banner within 3,
  Barbarians wounded units +1 attack, Forest units heal +5 in forest, Aqua ports −5 cost, Sand desert costs no extra move.
- Tribe active abilities on a cooldown: Sand sandstorm hides units, Forest grows/clears a forest tile, Aqua raises or
  lowers water, Cats sneak-capture.
- Tribe-specific buildings (Aqua fish market, Forest druid grove, Sand oasis well).
- **Cost:** medium; each ability needs AI handling.

## 7. Economy depth (optional)

- One extra resource at most: a luxury good (salt/furs) from some biomes, or "faith" from temples powering abilities.
- Market building with fixed conversion rates and a per-turn cap; trade routes paying by length and exposed to raids.
- **Risk:** more UI, AI and balance work for modest gain.

## 8. Unit growth beyond veterans

- Heroes: one rare named commander per player with an aura, lost for good on death (score penalty).
- Promotion choices at kill milestones (+attack, +HP, first strike, +1 move); keep +attack capped (damage snowballs with HP).

## 9. Game modes

- "Survive" against escalating neutral waves (needs 1), or a score-race mode where quests are the main way to score.

## Recommendation

Start with **1 (camps and raiders) + 2 (quests)**, then **3 (map features)** and **4 (events)**. Hold diplomacy and new
resources until the combat and economy loop feels thin in play.

## Requirements for any new system

- Multiplayer rolls happen on the host with the shared seed; the presenter only reads `GameEvent`s.
- Minimal AI policy plus an AI bench entry (bench resolves only ~4pt effects; run several hundred games).
- HUD line, tooltip, `help-texts.ts` entry, tutorial step if it appears before turn 10; small score hook.
- Setup-screen toggle so competitive rooms can keep classic rules.
