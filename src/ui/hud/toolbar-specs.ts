import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { tileAt } from '../../game/selection';
import { canAfford, moneyCost, villageUpgradeCost } from '../../game/resources';
import { canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS, canRepairBuilding, REPAIR_COST } from '../../game/buildings';
import { canHeal, canDisband, disbandCost, hasPirateDeal, PIRATE_DEAL_COST, UNIT_TYPES, UNIT_TYPE_NAMES } from '../../game/units';
import { SHIP_UPGRADE_COST, canUpgradeShip } from '../../game/ship';
import { unitsInVillage, villageCapacity, canBuildWall, WALL_COST } from '../../game/village';
import { canBuildRoad, ROAD_COST } from '../../game/roads';
import { canBuildBridge, BRIDGE_COST } from '../../game/bridges';
import { BuildingKind } from '../../game/events';
import { bonusEligibleFor } from '../../game/bonus';
import { bottleCollectableFor } from '../../game/bottles';
import { trapCells, TRAP_COST } from '../../game/traps';
import { stormEligible } from '../../game/storm';

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
        out.push({ key: 'spawn', label: t('ui.spawn'), disabled: false, onClick: () => useGameStore.getState().setOverlay({ kind: 'spawn' }) });
      }
      const cost = villageUpgradeCost(settlement.level);
      const upgradeDisabled = !canAfford(player.resources, cost);
      if (!upgradeDisabled) {
        out.push({
          key: 'upgrade',
          label: t('action.upgradeVillage', { wood: cost.wood, stone: cost.stone, money: cost.money }),
          disabled: false,
          onClick: () => gameController.upgradeSelectedVillageFromToolbar(),
        });
      }
    }
    if (settlement && settlement.owner === player.index && canBuildWall(tile, player)) {
      out.push({
        key: 'wall',
        label: t('action.buildWall', { stone: WALL_COST.stone, money: WALL_COST.money, ore: WALL_COST.ore }),
        disabled: false,
        onClick: () => gameController.buildSelectedWall(),
      });
    }
  }

  if (settlement === null) {
    if (tile.building && canRepairBuilding(map, tile, player)) {
      out.push({
        key: 'repair',
        label: t('action.repairBuilding', { wood: REPAIR_COST.wood, stone: REPAIR_COST.stone, ore: REPAIR_COST.ore, money: REPAIR_COST.money }),
        disabled: !canAfford(player.resources, REPAIR_COST),
        onClick: () => gameController.repairSelectedBuilding(),
      });
    }
    const kinds: Array<{ kind: BuildingKind; label: string }> = [
      { kind: 'sawmill', label: t('ui.buildsawmill10') },
      { kind: 'mine', label: t('ui.buildmine15') },
      { kind: 'port', label: t('ui.buildport10w302ore') },
      { kind: 'temple', label: t('ui.buildwatertemple10s30') },
      { kind: 'forestTemple', label: t('ui.buildforesttemple10s30') },
    ];
    for (const { kind, label } of kinds) {
      const ok = kind === 'sawmill'
        ? canBuildSawmill(map, tile, player)
        : kind === 'mine'
          ? canBuildMine(map, tile, player)
          : kind === 'port'
            ? canBuildPort(map, tile, player)
            : kind === 'temple'
              ? canBuildTemple(map, tile, player)
              : canBuildForestTemple(map, tile, player);
      if (!ok) continue;
      out.push({ key: kind, label, disabled: !canAfford(player.resources, BUILDING_COSTS[kind]), onClick: () => gameController.buildSelectedBuilding(kind) });
    }
    if (canBuildRoad(map, tile, player)) {
      out.push({ key: 'road', label: t('ui.buildroad5w2s10m'), disabled: !canAfford(player.resources, ROAD_COST), onClick: () => gameController.buildSelectedRoad() });
    }
    if (canBuildBridge(map, tile, player)) {
      out.push({ key: 'bridge', label: t('ui.buildbridge10w5s15m'), disabled: !canAfford(player.resources, BRIDGE_COST), onClick: () => gameController.buildSelectedBridge() });
    }
  }

  if (unit && unit.owner === store.localPlayerIndex) {
    if (canHeal(unit)) {
      out.push({ key: 'heal', label: t('ui.heal2hp'), disabled: false, onClick: () => gameController.healSelectedUnit() });
    }
    if (unit.shipLevel !== undefined && unit.shipLevel < 3) {
      const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
      const upgradable = canUpgradeShip(unit, tile, player);
      const ore = cost.ore > 0 ? ` + ${cost.ore} ${t('action.oreWord')}` : '';
      out.push({ key: 'upgrade-ship', label: t('action.upgradeShip', { money: cost.money, wood: cost.wood, ore }), disabled: !upgradable, onClick: () => gameController.upgradeSelectedShip() });
    }
    if (canDisband(unit)) {
      const disbandCostMoney = disbandCost(unit);
      out.push({
        key: 'disband',
        label: t('action.disband', { name: UNIT_TYPE_NAMES[unit.type], cost: disbandCostMoney }),
        disabled: !canAfford(player.resources, moneyCost(disbandCostMoney)),
        onClick: () => gameController.disbandSelectedUnit(),
      });
    }
    const idle = !unit.hasMoved && !unit.hasAttacked && !unit.hasHealed && (unit.stunTurns ?? 0) < 1;
    if (unit.type === 'stalker' && !unit.isStealthed && unit.shipLevel === undefined && idle) {
      out.push({ key: 'stealth', label: t('action.enableStealth'), disabled: false, onClick: () => gameController.enableStealthSelected() });
    }
    if (unit.type === 'builder' && unit.shipLevel === undefined) {
      out.push({ key: 'build', label: t('action.build'), disabled: !idle, onClick: () => useGameStore.getState().setOverlay({ kind: 'builderBuild' }) });
    }
    if (unit.type === 'trapper' && unit.shipLevel === undefined && trapCells(map, tile, player).length > 0) {
      out.push({ key: 'thorn-trap', label: t('action.buildTrap'), disabled: !idle || !canAfford(player.resources, TRAP_COST), onClick: () => gameController.placeTrap() });
    }
    if (unit.type === 'stormcaller' && stormEligible(map, unit)) {
      out.push({ key: 'storm', label: t('action.storm'), disabled: !idle, onClick: () => gameController.stormSelected() });
    }
  }

  if (unit && unit.type === 'pirate') {
    const dealt = hasPirateDeal(unit, player.index);
    out.push({
      key: 'deal',
      label: dealt ? t('action.pirateDealActive') : t('action.dealWithPirates', { money: PIRATE_DEAL_COST }),
      disabled: dealt || !canAfford(player.resources, moneyCost(PIRATE_DEAL_COST)),
      visibleWhenDisabled: true,
      onClick: () => gameController.dealWithSelectedPirate(),
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
