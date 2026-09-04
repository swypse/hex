import { GameMap, MapTile } from './mapGen';
import { BUILDING_COSTS, BUILDING_NAMES, buildingYield } from './buildings';
import { villageIncome } from './capture';
import { villageUpgradeCost } from './resources';
import { buildingsInVillage, claimRadius, villageBuildingLimit, unitsInVillage, villageCapacity } from './village';
import { SHIP_UPGRADE_COST } from './ship';

export function settlementHelpTitle(tile: MapTile): string {
  const name = tile.settlement?.name;
  return name && name.length > 0 ? name : 'Settlement';
}

export function settlementHelpLines(map: GameMap, tile: MapTile): string[] {
  const s = tile.settlement;
  if (!s) return [];
  const stationed = unitsInVillage(map, tile);
  const radius = claimRadius(s.level);
  const income = villageIncome(map, tile);
  const cost = villageUpgradeCost(s.level);
  const lines = [
    `Village level ${s.level}; holds ${stationed}/${villageCapacity(s.level)} units.`,
    `Claims territory up to ${radius} hexes away and produces ${income} money income per round (less when over capacity).`,
    `Upgrade to level ${s.level + 1} costs ${cost.wood} wood, ${cost.stone} stone and ${cost.money} money, and expands its claim, capacity and income.`,
    `Supports ${villageBuildingLimit(1)}/${villageBuildingLimit(2)}/${villageBuildingLimit(3)}/${villageBuildingLimit(4)} buildings at levels 1-4 (upgrade to allow more).`,
  ];
  if (s.owner === null) {
    lines.push('Neutral village: standing on it with a unit makes it capturable (red marker), then capture to claim it for 50 points.');
  } else {
    lines.push('Spawns units here while it is yours (a new unit can act from the next turn).');
  }
  return lines;
}

export function buildingHelpTitle(tile: MapTile): string {
  const b = tile.building;
  if (!b) return '';
  return `${BUILDING_NAMES[b.kind]} (level ${b.level})`;
}

export function buildingLimitHelpTitle(tile: MapTile): string {
  const s = tile.settlement;
  return s && s.name && s.name.length > 0 ? `${s.name}: building limits` : 'Building limits';
}

export function buildingLimitHelpLines(map: GameMap, tile: MapTile): string[] {
  const s = tile.settlement;
  if (!s) return [];
  const limits = [1, 2, 3, 4].map((l) => villageBuildingLimit(l)).join('/');
  const built = buildingsInVillage(map, tile);
  const limit = villageBuildingLimit(s.level);
  const plural = limit === 1 ? '' : 's';
  return [
    `Villages support ${limits} buildings at levels 1-4. This village is level ${s.level}, so it currently holds ${built}/${limit} building${plural}.`,
    'Upgrade the village to raise its building limit.',
    'Each building stands on one of the tiles the village claims around it — never on the village hex itself, and never on another settlement or building.',
    'Every building needs its own skill and costs resources (money, wood, stone or ore); none of them produce money.',
  ];
}

export function buildingHelpLines(map: GameMap, tile: MapTile): string[] {
  const b = tile.building;
  if (!b) return [];
  switch (b.kind) {
    case 'sawmill': {
      const y = buildingYield(map, tile, null);
      return [
        `Produces +${b.level} wood per round for each adjacent forest (currently ${y.wood} wood).`,
        `Requires the Forestry skill; costs ${BUILDING_COSTS.sawmill.money} money.`,
        'Built on owned land next to a forest.',
      ];
    }
    case 'mine': {
      const y = buildingYield(map, tile, null);
      const note = y.ore > b.level ? ' (+1 ore from Geology)' : '';
      return [
        `Produces ${y.stone} stone and ${y.ore} ore per round at level ${b.level}${note}.`,
        `Requires the Smithery skill; costs ${BUILDING_COSTS.mine.money} money.`,
        'Built on an owned mountain.',
      ];
    }
    case 'port': {
      return [
        'Boarding: move a unit onto the port and it becomes a ship (level 1); boarding ends the turn.',
        `Ship upgrade on an owned cell: to level 2 = ${SHIP_UPGRADE_COST[2].money} money + ${SHIP_UPGRADE_COST[2].wood} wood; to level 3 = ${SHIP_UPGRADE_COST[3].money} money + ${SHIP_UPGRADE_COST[3].wood} wood + ${SHIP_UPGRADE_COST[3].ore} ore.`,
        `Requires the Water skill; costs ${BUILDING_COSTS.port.wood} wood + ${BUILDING_COSTS.port.money} money + ${BUILDING_COSTS.port.ore} ore.`,
        'Built on an owned water tile.',
      ];
    }
    case 'temple': {
      return [
        'Grows one level every two turns, up to level 4.',
        'Awards 10/15/20/25 end-game score by level.',
        `Requires the Water temples skill; costs ${BUILDING_COSTS.temple.stone} stone + ${BUILDING_COSTS.temple.money} money.`,
        'Built on an owned water tile.',
      ];
    }
    case 'forestTemple': {
      return [
        'Grows one level every two turns, up to level 4.',
        'Awards 10/15/20/25 end-game score by level.',
        `Requires the Forest temple skill; costs ${BUILDING_COSTS.forestTemple.stone} stone + ${BUILDING_COSTS.forestTemple.money} money.`,
        'Built on an owned forest tile.',
      ];
    }
  }
}
