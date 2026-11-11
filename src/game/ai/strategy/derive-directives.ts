import { AiGoalId, AiPace, AiPersonalityId, SkillId, SpawnPreference } from '@enums';
import { hexDistance } from '../../map/hex';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import type { AiDifficultyProfile } from '../config/difficulty';
import { flagsFor } from '../config/flags';
import { AI_PERSONALITIES } from '../config/personality';
import type { AiSituation } from '../situation/situation';
import type { AiDirectives } from '../types/directives';
import type { AiStrategyState } from '../types/strategy-state';

function economySkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = flagsFor(player).militarySkills
    ? [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.SWORDSMAN, SkillId.SCIENCE, SkillId.GEOLOGY, SkillId.RIDING, SkillId.KNIGHTS]
    : [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.GEOLOGY, SkillId.SCIENCE];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function navalSkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = [SkillId.WATER, SkillId.NAVIGATION, SkillId.ARCHER, SkillId.CATAPULT];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function countOwnUnitsNear(map: GameMap, player: Player, target: { q: number; r: number }, radius: number): number {
  let n = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== player.index) continue;
    if (hexDistance(t, target) <= radius) n += 1;
  }
  return n;
}

function nearestOwnVillageTo(map: GameMap, player: Player, target: { q: number; r: number }): {
  q: number;
  r: number
} | null {
  let best: { q: number; r: number } | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== player.index) continue;
    const d = hexDistance(t, target);
    if (d < bestDist) {
      bestDist = d;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}

/** Threat-oriented goals override peacetime goals (naval over army, army over
 *  economy) so an economy plan cannot clobber the naval skill chain mid-threat. */
const GOAL_PRIORITY: Record<AiGoalId, number> = { economy: 0, score: 0, army: 1, defense: 2, naval: 3 };

export function deriveDirectives(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  difficulty: AiDifficultyProfile,
  strategy: AiStrategyState,
): AiDirectives {
  const personality = AI_PERSONALITIES[strategy.personalityId as AiPersonalityId] ?? AI_PERSONALITIES.balanced;
  const d: AiDirectives = {
    frontTarget: null,
    muster: null,
    spawnPlan: [],
    moneyReserve: 8,
    skillChain: null,
    pace: AiPace.NORMAL
  };

  for (const g of [...strategy.goals].sort((a, b) => GOAL_PRIORITY[a.id] - GOAL_PRIORITY[b.id])) {
    if (g.id === AiGoalId.ECONOMY) {
      d.pace = AiPace.SLOW;
      d.moneyReserve = Math.max(d.moneyReserve, 12);
      d.skillChain = economySkillChain(player);
    }
    if (g.id === AiGoalId.ARMY) {
      const target = g.target;
      if (!target) continue;
      d.frontTarget = target;
      d.pace = AiPace.RUSHED;
      if (d.moneyReserve > 4) d.moneyReserve = 4;
      const mustered = countOwnUnitsNear(map, player, target, 5);
      const minUnits = Math.round(personality.musterMinUnits * difficulty.strategy.musterFactor);
      const assaultReady = situation.ownPower >= situation.enemyPower * difficulty.strategy.assaultRatio;
      if (flagsFor(player).musterPhase) g.phase = assaultReady || mustered >= minUnits ? 'assault' : 'muster';
      if (g.phase === 'muster' && mustered < minUnits && !assaultReady) {
        d.muster = { tile: null, minUnits, target };
      }
      const village = nearestOwnVillageTo(map, player, target);
      if (village) {
        const freeTarget = situation.freeVillages.some((fv) => fv.village.q === target.q && fv.village.r === target.r);
        d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: freeTarget ? SpawnPreference.SCOUT : SpawnPreference.OFFENSE });
      }
    }
    if (g.id === AiGoalId.DEFENSE) {
      if (!g.target) continue;
      d.frontTarget = g.target;
      d.moneyReserve = 0;
      d.pace = AiPace.RUSHED;
      d.muster = { tile: g.target, minUnits: 1, target: g.target };
      const village = map.tiles.find((t) => t.settlement && t.settlement.owner === player.index && !t.unit);
      if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: SpawnPreference.DEFENSE });
    }
    if (g.id === AiGoalId.NAVAL) {
      d.skillChain = navalSkillChain(player);
      d.pace = AiPace.RUSHED;
      if (d.moneyReserve <= 8) d.moneyReserve = 10;
    }
    if (g.id === AiGoalId.SCORE) {
      d.pace = AiPace.RUSHED;
      d.moneyReserve = 0;
      if (situation.freeVillages.length > 0) {
        const fv = { q: situation.freeVillages[0]!.village.q, r: situation.freeVillages[0]!.village.r };
        d.frontTarget = fv;
        const village = nearestOwnVillageTo(map, player, fv);
        if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: SpawnPreference.SCOUT });
      }
    }
  }
  // The play style shifts how much is kept back while a plan runs.
  if (strategy.goals.length > 0) d.moneyReserve = Math.max(0, d.moneyReserve + personality.reserveDelta);
  if (situation.endangered) d.moneyReserve = 0;
  return d;
}
