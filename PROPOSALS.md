# Game feature proposals

Ideas that build on systems already in the game (seasons, weather, fire, ice, pirates, bonuses, bottles, temples, roads, food, veterans). Ordered by fit. Nothing here is implemented.

## 1. Neutral threats and camps (best fit)

- **Wild camps:** neutral units guard bonuses or free villages. Clearing one gives a reward: gold, a veteran or a skill discount.
- **Roaming events:** a wolf pack in winter that raids farms; a bandit band that follows roads and burns them (reuses the road-cutting logic). The land counterpart of pirates.
- **Map-centre boss:** a strong neutral the leader fights for a big prize.
- **Why:** uses the existing neutral owner `-1` and AI code, gives players targets in the early turns, and gives the AI targets other than enemy players.
- **Cost:** medium (spawn rules, simple neutral AI, balancing).

## 2. Quests and small goals

- Each player gets 2-3 optional goals per game or season: "capture a village before turn 20", "build a port", "kill 3 pirates", "hold 2 temples". Rewards: gold, a one-off skill discount, a veteran.
- Some goals are shared and competitive: the first to reach a landmark gets the prize.
- **Why:** adds direction without changing the core rules; the achievements system already tracks most conditions.
- **Cost:** low to medium (UI plus a goal definition list).

## 3. Random events

Per-season draws on top of the existing weather:

- Good: harvest festival (extra food), travelling merchant (buy one rare item), refugees (a free unit).
- Bad: plague (a village loses population or income), raid, drought-linked famine.
- Choice events: "spend 10 gold to avert it".
- **Why:** fits the seasons and the weather event pipeline; adds luck against the AI's predictability.
- **Cost:** low.

## 4. More resources and economy depth

- A luxury good (salt or furs) that only some biomes produce, making trade routes meaningful.
- Or a "faith" resource from temples that powers abilities.
- Mid-size option: tools or weapons from ore plus wood, gating upgrades.
- **Risk:** more resources means more UI, AI and balance work for modest gain. Add at most one.

## 5. Trading and diplomacy

- **Trade routes:** connect two villages by road or port to earn gold; longer or more exposed routes pay more, which gives road raiding a real payoff.
- **Player-to-player:** tribute, non-aggression pacts, gifts; mainly useful in multiplayer.
- **Cost:** medium for routes, high for diplomacy (AI behaviour, UI, abuse cases).

## 6. More abilities

- Tribe-flavoured active abilities on a cooldown, e.g. Sand: sandstorm that hides units; Forest: grow or clear a forest tile; Aqua: raise or lower water; Cats: sneak-capture.
- Or a veteran perk tree: units that survive fights earn choices.
- **Why:** deepens tribe identity (starts now match the tribe's biome).
- **Cost:** medium; each ability needs AI handling.

## 7. Map features to contest

- Ruins or wonders: capturing one gives a lasting bonus (+income, +vision, a free skill). Mountain passes and bridges as chokepoints.
- Cheap with the bonus-placement code; gives the AI clear targets.

## 8. Game modes

- "Survive" mode against escalating neutral waves (needs idea 1), or a score-race mode where quests are the main way to score.

## Recommendation

Start with **1 (neutral camps and raiders) together with 2 (quests)**: quests say what to do, neutrals are the obstacle, and both reuse existing code. Add **3 (random events)** next because it is cheap. Hold trading and new resources until the combat and economy loop feels thin in play.
