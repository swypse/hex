import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { tileAt } from '../../game/selection';
import { canAfford, villageUpgradeCost } from '../../game/resources';
import { canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS } from '../../game/buildings';
import { canHeal, UNIT_TYPES } from '../../game/units';
import { SHIP_UPGRADE_COST, canUpgradeShip } from '../../game/ship';
import { unitsInVillage, villageCapacity } from '../../game/village';
import { canBuildRoad, ROAD_COST } from '../../game/roads';
import { canBuildBridge, BRIDGE_COST } from '../../game/bridges';
import { BuildingKind } from '../../game/events';
import { bonusEligibleFor } from '../../game/bonus';

export interface ToolbarSpec {
  key: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}

export function toolbarSpecs(): ToolbarSpec[] {
  const store = useGameStore.getState();
  const selection = store.selection;
  const map = gameController.getMap();
  if (!selection || !map) return [];
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
      out.push({ key: 'capture', label: 'Capture village!', disabled: false, onClick: () => gameController.captureSelectedVillage() });
    }
    if (isOwned) {
      const minPrice = Math.min(...Object.values(UNIT_TYPES).filter((t) => t.price > 0).map((t) => t.price));
      const spawnDisabled = !!tile.unit || unitsInVillage(map, tile) >= villageCapacity(settlement.level) || player.resources.money < minPrice;
      if (!spawnDisabled) {
        out.push({ key: 'spawn', label: 'Spawn', disabled: false, onClick: () => useGameStore.getState().setOverlay({ kind: 'spawn' }) });
      }
      const cost = villageUpgradeCost(settlement.level);
      const upgradeDisabled = !canAfford(player.resources, cost);
      if (!upgradeDisabled) {
        out.push({
          key: 'upgrade',
          label: `Upgrade village (${cost.wood}w, ${cost.stone}s, ${cost.money}m)`,
          disabled: false,
          onClick: () => gameController.upgradeSelectedVillageFromToolbar(),
        });
      }
    }
  }

  if (settlement === null) {
    const kinds: Array<{ kind: BuildingKind; label: string }> = [
      { kind: 'sawmill', label: 'Build sawmill (10)' },
      { kind: 'mine', label: 'Build mine (15)' },
      { kind: 'port', label: 'Build port (10w, 30, 2 ore)' },
      { kind: 'temple', label: 'Build water temple (10s, 30)' },
      { kind: 'forestTemple', label: 'Build forest temple (10s, 30)' },
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
      out.push({ key: 'road', label: 'Build a road (5w, 2s, 10m)', disabled: !canAfford(player.resources, ROAD_COST), onClick: () => gameController.buildSelectedRoad() });
    }
    if (canBuildBridge(map, tile, player)) {
      out.push({ key: 'bridge', label: 'Build bridge (10w, 5s, 15m)', disabled: !canAfford(player.resources, BRIDGE_COST), onClick: () => gameController.buildSelectedBridge() });
    }
  }

  if (unit && unit.owner === store.localPlayerIndex) {
    if (canHeal(unit)) {
      out.push({ key: 'heal', label: 'Heal +2 HP', disabled: false, onClick: () => gameController.healSelectedUnit() });
    }
    if (unit.shipLevel !== undefined && unit.shipLevel < 3) {
      const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
      const upgradable = canUpgradeShip(unit, tile, player);
      const oreText = cost.ore > 0 ? ` + ${cost.ore} ore` : '';
      out.push({ key: 'upgrade-ship', label: `Upgrade ship (${cost.money} money + ${cost.wood} wood${oreText})`, disabled: !upgradable, onClick: () => gameController.upgradeSelectedShip() });
    }
  }

  if (
    tile.bonus &&
    !store.aiActive &&
    !store.gameOver &&
    bonusEligibleFor(map, store.localPlayerIndex, store.turn).some((t) => t.q === tile.q && t.r === tile.r)
  ) {
    out.push({ key: 'bonus', label: 'Get the bonus', disabled: false, onClick: () => gameController.claimBonus() });
  }

  return out;
}
