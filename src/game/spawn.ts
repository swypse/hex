import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay } from './resources';
import { hasSkill } from './skills';
import { makeUnit, UNIT_TYPES, UnitType } from './units';
import { unitsInVillage, villageCapacity } from './village';

export function spawnUnit(
  map: GameMap,
  villageTile: MapTile,
  type: UnitType,
  player: Player,
): boolean {
  const settlement = villageTile.settlement;
  if (!settlement || settlement.owner !== player.index) return false;
  if (villageTile.unit) return false;
  if (unitsInVillage(map, villageTile) >= villageCapacity(settlement.level)) return false;
  if (type === 'rider' && !hasSkill(player, 'riding')) return false;
  if (type === 'knight' && !hasSkill(player, 'knights')) return false;
  if (type === 'swordsman' && !hasSkill(player, 'swordsman')) return false;
  if (type === 'shield' && !hasSkill(player, 'shields')) return false;
  if (type === 'catapult' && !hasSkill(player, 'catapult')) return false;
  const cost = { wood: UNIT_TYPES[type].priceWood, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
  if (!canAfford(player.resources, cost)) return false;

  player.resources = pay(player.resources, cost);
  villageTile.unit = makeUnit(player.index, type, villageTile.q, villageTile.r, {
    id: `spawn-${Date.now()}`,
    hasMoved: true,
    hasAttacked: true,
    hasHealed: true,
    spawnVillage: { q: villageTile.q, r: villageTile.r },
  });
  return true;
}
