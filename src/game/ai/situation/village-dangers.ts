import type { GameMap, MapTile } from '../../map/map-gen';
import type { EnemyUnit, VillageDanger } from './situation';
import { turnsToOccupy } from './turns-to-occupy';

export function ownVillageDangers(map: GameMap, playerIndex: number, enemies: EnemyUnit[], guardWindow: number): VillageDanger[] {
  const dangers: VillageDanger[] = [];
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== playerIndex) continue;
    if (t.unit && t.unit.owner === playerIndex) continue;
    let minTurns = Infinity;
    for (const e of enemies) {
      if (e.unit.owner < 0) continue; // pirates do not capture villages
      const turns = turnsToOccupy(e.tile, t, e.unit);
      if (turns < minTurns) minTurns = turns;
    }
    if (minTurns <= guardWindow) dangers.push({ village: t, enemyTurns: minTurns });
  }
  return dangers;
}

/** Tiles holding the player's units, collected once so per-village distance
 *  scans loop over a handful of units instead of the whole map. */
export function ownUnitTiles(map: GameMap, playerIndex: number): MapTile[] {
  const out: MapTile[] = [];
  for (const t of map.tiles) if (t.unit && t.unit.owner === playerIndex) out.push(t);
  return out;
}
