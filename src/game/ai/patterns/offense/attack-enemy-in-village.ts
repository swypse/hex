import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';
import { attackIntruder } from './attack-intruder';

export const ATTACK_ENEMY_IN_VILLAGE_PATTERN: AiPattern = {
    id: 'attack-enemy-in-village',
    priority: 200,
    evaluate({ map, player, state }): AiAction[] | null {
      const enemyInVillage = map.tiles.find(
        (t) =>
          t.unit &&
          t.settlement &&
          t.settlement.owner === player.index &&
          t.unit.owner !== player.index,
      );
      return enemyInVillage ? attackIntruder(map, player, state, enemyInVillage) : null;
    },
  };
