import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { villageUpgradeCost } from '../../game/economy/resources';
import { canAffordAt, villagesJoinedBy } from '../../game/economy/stock';
import { canBuildSawmill, canBuildFarm, canBuildGranary, canBurnBuilding, canBurnRoad, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS, canRepairBuilding, REPAIR_COST, canAffordAnyBuilderBuild } from '../../game/economy/buildings';
import { canHeal, canDisband, canDealWithPirate, disbandCost, hasPirateDeal, PIRATE_DEAL_COST, UNIT_TYPES, UNIT_TYPE_NAMES } from '../../game/units/units';
import { SHIP_UPGRADE_COST, canUpgradeShip } from '../../game/units/ship';
import { unitsInVillage, villageCapacity, canBuildWall, WALL_COST } from '../../game/economy/village';
import { canBuildRoad, ROAD_COST } from '../../game/economy/roads';
import { canBuildBridge, BRIDGE_COST } from '../../game/economy/bridges';
import { bonusEligibleFor } from '../../game/map/bonus';
import { bottleCollectableFor } from '../../game/map/bottles';
import { trapCells, TRAP_COST } from '../../game/units/traps';
import { stormEligible } from '../../game/units/storm';
import { adjacentEnemyVillages } from '../../game/units/stalker';
import { BuildingKind, OverlayKind, UnitType } from '@enums';
import { tileAt } from '../../game/map/tile-index';

export interface ToolbarSpec {
  key: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** Render the button even when disabled (e.g. an already-active pirate deal). */
  visibleWhenDisabled?: boolean;
}

export function toolbarSpecs(): ToolbarSpec[] {
  const store = useGameStore.getState();
  const selection = store.selection;
  const map = gameController.getMap();
  if (!selection || !map) return [];
  if (store.paused) return [];
  const tile = tileAt(map, selection.q, selection.r);
  const player = store.players[store.localPlayerIndex];
  if (!tile || !player) return [];

  const out: ToolbarSpec[] = [];
  const unit = tile.unit;
  const settlement = tile.settlement;

  if (settlement) {
    const isOwned = settlement.owner === store.localPlayerIndex;
    const isCapturable = !isOwned && unit !== null && unit.owner === store.localPlayerIndex && settlement.captureReady;
    if (isCapturable) {
      out.push({ key: 'capture', label: t('ui.capturevillage'), disabled: false, onClick: () => gameController.captureSelectedVillage() });
    }
    if (isOwned) {
      const minPrice = Math.min(...Object.values(UNIT_TYPES).filter((t) => t.price > 0).map((t) => t.price));
      const spawnDisabled = !!tile.unit || unitsInVillage(map, tile) >= villageCapacity(settlement.level) || player.resources.money < minPrice;
      if (!spawnDisabled) {
        out.push({ key: 'spawn', label: t('ui.spawn'), disabled: false, onClick: () => useGameStore.getState().setOverlay({ kind: OverlayKind.SPAWN }) });
      }
      const cost = villageUpgradeCost(settlement.level);
      const upgradeDisabled = !canAffordAt(map, player, tile, cost);
      if (!upgradeDisabled) {
        out.push({
          key: 'upgrade',
          label: t('action.upgradeVillage', { wood: cost.wood, stone: cost.stone, money: cost.money }),
          disabled: false,
          onClick: () => gameController.actions.upgradeSelectedVillageFromToolbar(),
        });
      }
    }
    if (settlement && settlement.owner === player.index && canBuildWall(map, tile, player)) {
      out.push({
        key: 'wall',
        label: t('action.buildWall', { stone: WALL_COST.stone, money: WALL_COST.money, ore: WALL_COST.ore }),
        disabled: false,
        onClick: () => gameController.actions.buildSelectedWall(),
      });
    }
  }

  if (settlement === null) {
    if (tile.building && canRepairBuilding(map, tile, player)) {
      out.push({
        key: 'repair',
        label: t('action.repairBuilding', { wood: REPAIR_COST.wood, stone: REPAIR_COST.stone, ore: REPAIR_COST.ore, money: REPAIR_COST.money }),
        disabled: !canAffordAt(map, player, tile, REPAIR_COST),
        onClick: () => gameController.actions.repairSelectedBuilding(),
      });
    }
    const kinds: Array<{ kind: BuildingKind; label: string }> = [
      { kind: BuildingKind.SAWMILL, label: t('ui.buildsawmill10') },
      { kind: BuildingKind.MINE, label: t('ui.buildmine15') },
      { kind: BuildingKind.PORT, label: t('ui.buildport10w302ore') },
      { kind: BuildingKind.TEMPLE, label: t('ui.buildwatertemple10s30') },
      { kind: BuildingKind.FOREST_TEMPLE, label: t('ui.buildforesttemple10s30') },
      { kind: BuildingKind.FARM, label: t('ui.buildfarm') },
      { kind: BuildingKind.GRANARY, label: t('ui.buildgranary') },
    ];
    for (const { kind, label } of kinds) {
      const ok = kind === BuildingKind.SAWMILL
        ? canBuildSawmill(map, tile, player)
        : kind === BuildingKind.MINE
          ? canBuildMine(map, tile, player)
          : kind === BuildingKind.PORT
            ? canBuildPort(map, tile, player)
            : kind === BuildingKind.TEMPLE
              ? canBuildTemple(map, tile, player)
              : kind === BuildingKind.FARM
                ? canBuildFarm(map, tile, player)
                : kind === BuildingKind.GRANARY
                  ? canBuildGranary(map, tile, player)
                  : canBuildForestTemple(map, tile, player);
      if (!ok) continue;
      // A port is a road/water-cluster node: it may be paid by the networks it
      // would join, just like a road or bridge.
      const joined = kind === BuildingKind.PORT ? villagesJoinedBy(map, player.index, tile) : [];
      out.push({ key: kind, label, disabled: !canAffordAt(map, player, tile, BUILDING_COSTS[kind], joined), onClick: () => gameController.actions.buildSelectedBuilding(kind) });
    }
    if (canBuildRoad(map, tile, player)) {
      out.push({ key: 'road', label: t('ui.buildroad5w2s10m'), disabled: !canAffordAt(map, player, tile, ROAD_COST, villagesJoinedBy(map, player.index, tile)), onClick: () => gameController.actions.buildSelectedRoad() });
    }
    if (canBuildBridge(map, tile, player)) {
      out.push({ key: 'bridge', label: t('ui.buildbridge10w5s15m'), disabled: !canAffordAt(map, player, tile, BRIDGE_COST, villagesJoinedBy(map, player.index, tile)), onClick: () => gameController.actions.buildSelectedBridge() });
    }
  }

  if (unit && unit.owner === store.localPlayerIndex) {
    if (canHeal(unit)) {
      out.push({ key: 'heal', label: t('ui.heal2hp'), disabled: false, onClick: () => gameController.actions.healSelectedUnit() });
    }
    if (unit.shipLevel !== undefined && unit.shipLevel < 3) {
      const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
      const upgradable = canUpgradeShip(map, unit, tile, player);
      const ore = cost.ore > 0 ? ` + ${cost.ore} ${t('action.oreWord')}` : '';
      out.push({ key: 'upgrade-ship', label: t('action.upgradeShip', { money: cost.money, wood: cost.wood, ore }), disabled: !upgradable, onClick: () => gameController.actions.upgradeSelectedShip() });
    }
    if (canDisband(unit)) {
      const disbandCostMoney = disbandCost(unit);
      out.push({
        key: 'disband',
        label: t('action.disband', { name: UNIT_TYPE_NAMES[unit.type], cost: disbandCostMoney }),
        disabled: player.resources.money < disbandCostMoney,
        onClick: () => gameController.actions.disbandSelectedUnit(),
      });
    }
    const idle = !unit.hasMoved && !unit.hasAttacked && !unit.hasHealed && (unit.stunTurns ?? 0) < 1;
    if (unit.type === UnitType.STALKER && !unit.isStealthed && unit.shipLevel === undefined && idle && adjacentEnemyVillages(map, tile, player.index).length === 0) {
      out.push({ key: 'stealth', label: t('action.enableStealth'), disabled: false, onClick: () => gameController.actions.enableStealthSelected() });
    }
    if (unit.type === UnitType.BUILDER && unit.shipLevel === undefined && canAffordAnyBuilderBuild(map, player, tile)) {
      out.push({ key: 'build', label: t('action.build'), disabled: !idle, onClick: () => useGameStore.getState().setOverlay({ kind: OverlayKind.BUILDER_BUILD }) });
    }
    if (unit.type === UnitType.TRAPPER && unit.shipLevel === undefined && trapCells(map, tile).length > 0) {
      out.push({ key: 'thorn-trap', label: t('action.buildTrap'), disabled: !idle || !canAffordAt(map, player, tile, TRAP_COST), onClick: () => gameController.actions.placeTrap() });
    }
    if (canBurnBuilding(tile, unit) && tile.building) {
      out.push({ key: `burn-${tile.building.kind}`, label: t(tile.building.kind === BuildingKind.FARM ? 'action.burnFarm' : 'action.burnGranary'), disabled: false, onClick: () => gameController.actions.burnSelected() });
    }
    if (canBurnRoad(tile, unit)) {
      out.push({ key: 'burn-road', label: t('action.burnRoad'), disabled: false, onClick: () => gameController.actions.burnRoadSelected() });
    }
    if (unit.type === UnitType.STORMCALLER && stormEligible(map, unit)) {
      out.push({ key: 'storm', label: t('action.storm'), disabled: !idle, onClick: () => gameController.actions.stormSelected() });
    }
  }

  if (unit && canDealWithPirate(tile, player.index)) {
    const dealt = hasPirateDeal(unit, player.index);
    out.push({
      key: 'deal',
      label: dealt ? t('action.pirateDealActive') : t('action.dealWithPirates', { money: PIRATE_DEAL_COST }),
      disabled: dealt || player.resources.money < PIRATE_DEAL_COST,
      visibleWhenDisabled: true,
      onClick: () => gameController.actions.dealWithSelectedPirate(),
    });
  }

  if (
    tile.bonus &&
    !store.aiActive &&
    !store.gameOver &&
    bonusEligibleFor(map, store.localPlayerIndex, store.turn).some((t) => t.q === tile.q && t.r === tile.r)
  ) {
    out.push({ key: 'bonus', label: t('ui.getthebonus'), disabled: false, onClick: () => gameController.claimBonus() });
  }

  if (
    tile.bottle &&
    !store.aiActive &&
    !store.gameOver &&
    !store.paused &&
    bottleCollectableFor(map, store.localPlayerIndex, store.turn).some((t) => t.q === tile.q && t.r === tile.r)
  ) {
    out.push({ key: 'bottle', label: t('ui.getbottle'), disabled: false, onClick: () => gameController.getBottle() });
  }

  return out;
}
