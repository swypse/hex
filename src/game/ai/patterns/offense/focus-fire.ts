import { isExploredFor } from '../../../map/explore';
import type { MapTile } from '../../../map/map-gen';
import { attackDamage } from '../../../units/combat';
import { type Unit, UNIT_TYPES } from '../../../units/units';
import { flagsFor } from '../../config/flags';
import { attackersForTile, gangAttackActions } from '../../military/gang-attack';
import { gangForecast } from '../../military/gang-forecast';
import { isHitVillage } from '../../military/hit-village';
import { planGangAttack } from '../../military/plan-gang-attack';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const FOCUS_FIRE_PATTERN: AiPattern = {
    id: 'focus-fire',
    priority: 190,
    evaluate({ map, player, state, turn = 0 }): AiAction[] | null {
      // Gang up on a single enemy: every idle unit that can attack it now — or
      // reach it with a move first — attacks it. Killable targets win, otherwise
      // the enemy that can be hit by the most units / combined damage is chosen.
      let best:
        | { t: MapTile; attackers: { unit: Unit; moveTo: MapTile | null }[]; killable: boolean; total: number; hit: boolean; value: number }
        | null = null;
      for (const t of map.tiles) {
        const enemy = t.unit;
        if (!enemy || enemy.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        const attackers = attackersForTile(map, player, t, state);
        if (attackers.length < 2) continue;
        // Kill chains: judge the gang by the real combat formula (defense and terrain
        // included), prefer lethal gangs on valuable targets that cost the fewest counters.
        const chain = flagsFor(player).killChains ? gangForecast(map, player, t, attackers, state) : null;
        const total = chain ? chain.damage : attackers.reduce((s, a) => s + attackDamage(a.unit), 0);
        const killable = chain ? chain.lethal : total >= enemy.hp;
        const hit = isHitVillage(player, t, turn);
        const value = chain ? UNIT_TYPES[enemy.type].price - chain.counter : 0;
        const better =
          best === null ||
          (killable && !best.killable) ||
          (killable === best.killable &&
            (hit !== best.hit
              ? hit
              : chain && killable && value !== best.value
                ? value > best.value
                : attackers.length > best.attackers.length || (attackers.length === best.attackers.length && total > best.total)));
        if (better) best = { t, attackers, killable, total, hit, value };
      }
      if (!best) return null;
      return flagsFor(player).attackPlan
        ? planGangAttack(map, player, best.t, best.attackers, state)
        : gangAttackActions(map, player, best.t, best.attackers, state);
    },
  };
