import { GameMap, MapTile } from './mapGen';
import { BUILDING_COSTS, BUILDING_NAMES, buildingYield } from './buildings';
import { villageIncome } from './capture';
import { villageUpgradeCost } from './resources';
import { buildingsInVillage, claimRadius, villageBuildingLimit, unitsInVillage, villageCapacity } from './village';
import { SHIP_UPGRADE_COST } from './ship';
import { BRIDGE_COST } from './bridges';
import { BRIDGE_SCORE } from './score';
import { t } from '../i18n';

export function settlementHelpTitle(tile: MapTile): string {
  const name = tile.settlement?.name;
  return name && name.length > 0 ? name : t('hud.selected.settlementDefault');
}

export function settlementHelpLines(map: GameMap, tile: MapTile): string[] {
  const s = tile.settlement;
  if (!s) return [];
  const stationed = unitsInVillage(map, tile);
  const radius = claimRadius(s.level);
  const income = villageIncome(map, tile);
  const cost = villageUpgradeCost(s.level);
  const limits = [1, 2, 3, 4].map((l) => villageBuildingLimit(l));
  const lines = [
    t('help.settlement.level', { level: s.level, held: stationed, capacity: villageCapacity(s.level) }),
    t('help.settlement.claim', { radius, income }),
    t('help.settlement.upgrade', { level: s.level + 1, wood: cost.wood, stone: cost.stone, money: cost.money }),
    t('help.settlement.slots', { l1: limits[0]!, l2: limits[1]!, l3: limits[2]!, l4: limits[3]! }),
  ];
  if (s.owner === null) {
    lines.push(t('help.settlement.neutral'));
  } else {
    lines.push(t('help.settlement.spawns'));
  }
  return lines;
}

export function buildingHelpTitle(tile: MapTile): string {
  const b = tile.building;
  if (!b) return '';
  return t('help.building.title', { name: BUILDING_NAMES[b.kind], level: b.level });
}

export function bridgeHelpTitle(): string {
  return t('help.bridge.title');
}

export function bridgeHelpLines(): string[] {
  return [
    t('help.bridge.what'),
    t('help.bridge.road'),
    t('help.bridge.build', { wood: BRIDGE_COST.wood, stone: BRIDGE_COST.stone, money: BRIDGE_COST.money }),
    t('help.bridge.score', { score: BRIDGE_SCORE }),
  ];
}

export function buildingLimitHelpTitle(tile: MapTile): string {
  const s = tile.settlement;
  return s && s.name && s.name.length > 0
    ? t('help.blimit.title', { name: s.name })
    : t('help.blimit.titlePlain');
}

export function buildingLimitHelpLines(map: GameMap, tile: MapTile): string[] {
  const s = tile.settlement;
  if (!s) return [];
  const limits = [1, 2, 3, 4].map((l) => villageBuildingLimit(l)).join('/');
  const built = buildingsInVillage(map, tile);
  const limit = villageBuildingLimit(s.level);
  const plural = limit === 1 ? '' : 's';
  return [
    t('help.blimit.line0', { limits, level: s.level, built, limit, plural }),
    t('help.blimit.line1'),
    t('help.blimit.line2'),
    t('help.blimit.line3'),
  ];
}

export function buildingHelpLines(map: GameMap, tile: MapTile): string[] {
  const b = tile.building;
  if (!b) return [];
  switch (b.kind) {
    case 'sawmill': {
      const y = buildingYield(map, tile, null);
      return [
        t('help.building.sawmill.produce', { level: b.level, wood: y.wood }),
        t('help.building.sawmill.skill', { money: BUILDING_COSTS.sawmill.money }),
        t('help.building.sawmill.place'),
      ];
    }
    case 'mine': {
      const y = buildingYield(map, tile, null);
      const note = y.ore > b.level ? t('help.building.mine.note') : '';
      return [
        t('help.building.mine.produce', { stone: y.stone, ore: y.ore, level: b.level, note }),
        t('help.building.mine.skill', { money: BUILDING_COSTS.mine.money }),
        t('help.building.mine.place'),
      ];
    }
    case 'port': {
      return [
        t('help.building.port.board'),
        t('help.building.port.upgrade', {
          m2: SHIP_UPGRADE_COST[2].money, w2: SHIP_UPGRADE_COST[2].wood,
          m3: SHIP_UPGRADE_COST[3].money, w3: SHIP_UPGRADE_COST[3].wood, o3: SHIP_UPGRADE_COST[3].ore,
        }),
        t('help.building.port.skill', {
          wood: BUILDING_COSTS.port.wood, money: BUILDING_COSTS.port.money, ore: BUILDING_COSTS.port.ore,
        }),
        t('help.building.port.place'),
      ];
    }
    case 'temple': {
      return [
        t('help.building.temple.grow'),
        t('help.building.temple.score'),
        t('help.building.temple.skill', { stone: BUILDING_COSTS.temple.stone, money: BUILDING_COSTS.temple.money }),
        t('help.building.temple.place'),
      ];
    }
    case 'forestTemple': {
      return [
        t('help.building.temple.grow'),
        t('help.building.temple.score'),
        t('help.building.forestTemple.skill', { stone: BUILDING_COSTS.forestTemple.stone, money: BUILDING_COSTS.forestTemple.money }),
        t('help.building.forestTemple.place'),
      ];
    }
  }
}
