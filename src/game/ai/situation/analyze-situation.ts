import { AiStance, GameMode } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiDifficultyProfile } from '../config/difficulty';
import { enemyPower, ownPower, ownUnitCount } from './army-power';
import { freeVillages } from './free-villages';
import { collectNavalThreats } from './naval-threats';
import { nearestEnemyVillage } from './nearest-enemy-village';
import type { AiSituation } from './situation';
import { ownVillageDangers } from './village-dangers';
import { visibleEnemies } from './visible-enemies';

export function analyzeSituation(
  map: GameMap,
  player: Player,
  mode: GameMode,
  profile: AiDifficultyProfile,
): AiSituation {
  const enemies = visibleEnemies(map, player.index);
  const dangers = ownVillageDangers(map, player.index, enemies, profile.guardWindow);
  const endangered = dangers.length > 0;
  const enemyOnOwnVillage = enemies.some(
    (e) => e.tile.settlement && e.tile.settlement.owner === player.index,
  );

  const pow = ownPower(map, player.index);
  const epow = enemyPower(map, player.index);
  const enemyVillage = nearestEnemyVillage(map, player.index);
  const units = ownUnitCount(map, player.index);

  let stance: AiStance = AiStance.SETTLE;
  if (enemyOnOwnVillage || endangered) {
    stance = AiStance.DEFEND;
  } else if (mode === GameMode.CAPTURE && enemyVillage && units >= 3 && pow >= epow * profile.warRatio) {
    stance = AiStance.WAR;
  }

  const navalEnemies = collectNavalThreats(map, player.index, enemies, profile.navalThreatRadius);
  const navalThreat = navalEnemies.length > 0;
  const nearestNaval = navalEnemies[0] ?? null;

  return {
    stance,
    enemies,
    dangers,
    endangered,
    frontTarget: stance === AiStance.WAR ? enemyVillage : null,
    freeVillages: freeVillages(map, player.index),
    ownPower: pow,
    enemyPower: epow,
    navalThreat,
    navalEnemies,
    nearestNaval,
  };
}
