import { aiLoggingEnabled, setAiLogging } from '@/game/ai/ai';
import { RESOURCE_CHEAT_AMOUNT } from '@/game/cheats';
import { type GameEvent } from '@/game/events';
import { hexDistance } from '@/game/map/hex';
import { type MapTile } from '@/game/map/map-gen';
import { Simulator } from '@/game/simulator';
import { SKILLS } from '@/game/skills';
import { addStock } from '@/game/economy/stock';
import { TileType } from '@/game/map/tile-types';
import { makeUnit, PIRATE_OWNER } from '@/game/units/units';
import { useGameStore } from '@/store/game-store';
import { BuildingKind, NetMode, Screen, Season, SkillId, UnitType, WeatherType } from '@enums';
import { pickRandom } from '../util/random';

export interface CheatHost {
  readonly sim: Simulator | null;
  syncStore(): void;
  saveGame(): void;
  render(): void;
  presentEvents(events: GameEvent[], preExplored: Set<string>): Promise<void>;
  exploredKeysFor(playerIndex: number): Set<string>;
  enqueue(fn: () => Promise<void>): Promise<void>;
  /** Marks the whole map explored and every tribe known for the local player. */
  revealMapForLocal(): void;
}

/** Single-player debug cheats (the hidden key combos in the game screen). */
export class CheatController {
  constructor(private readonly host: CheatHost) {}

  /** Cheat (single-player only): grants the local player +100 of every
   *  resource. Returns true when granted. */
  cheatResources(): boolean {
    if (!this.host.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return false;
    const local = this.host.sim.players[store.localPlayerIndex];
    if (!local) return false;
    local.resources.money += RESOURCE_CHEAT_AMOUNT;
    // Materials live in villages: every own village gets the amount.
    for (const t of this.host.sim.map.tiles) {
      if (t.settlement?.owner !== local.index) continue;
      addStock(t, {
        wood: RESOURCE_CHEAT_AMOUNT,
        stone: RESOURCE_CHEAT_AMOUNT,
        ore: RESOURCE_CHEAT_AMOUNT,
        food: RESOURCE_CHEAT_AMOUNT
      });
    }
    this.host.syncStore();
    this.host.saveGame();
    return true;
  }

  /** Cheat (single-player only): opens every skill for the local player.
   *  Returns true when granted. */
  cheatOpenAllSkills(): boolean {
    if (!this.host.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return false;
    const local = this.host.sim.players[store.localPlayerIndex];
    if (!local) return false;
    local.skills = Object.keys(SKILLS) as SkillId[];
    this.host.syncStore();
    this.host.saveGame();
    return true;
  }

  /** Cheat (single-player only): reveals the whole map and all tribes for the
   *  local player. Returns true when applied. */
  cheatRemoveFog(): boolean {
    if (!this.host.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return false;
    this.host.revealMapForLocal();
    return true;
  }

  /** Cheat (single-player only): eliminates every enemy tribe (villages, units
   *  and territory). The local player's next End Turn then resolves the
   *  capture-mode victory. Returns true when applied. */
  cheatWin(): boolean {
    if (!this.host.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return false;
    const local = this.host.sim.players[store.localPlayerIndex];
    if (!local) return false;
    let any = false;
    for (const p of this.host.sim.players) {
      if (p.index === store.localPlayerIndex) continue;
      if (this.host.sim.eliminatePlayer(p.index)) any = true;
    }
    if (!any) return false;
    this.host.syncStore();
    this.host.saveGame();
    this.host.render();
    return true;
  }

  /** Distance from `tile` to the AI's nearest own unit, settlement or port. */
  private nearestAiAssetDistance(aiIndex: number, tile: { q: number; r: number }): number {
    const map = this.host.sim!.map;
    let best = Infinity;
    for (const t of map.tiles) {
      const ownUnit = t.unit !== null && t.unit.owner === aiIndex;
      const ownSettlement = t.settlement !== null && t.settlement.owner === aiIndex;
      const ownPort = t.building !== null && t.building.kind === BuildingKind.PORT && t.ownedBy === aiIndex;
      if (ownUnit || ownSettlement || ownPort) {
        const d = hexDistance(tile, t);
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** Pick an empty water tile the AI can see near its territory, falling back
   *  to any empty water tile. */
  private pirateSpawnTileFor(aiIndex: number): MapTile | null {
    const map = this.host.sim!.map;
    const water = map.tiles.filter(
      (t) => t.terrain === TileType.Water && !t.unit,
    );
    const explored = water.filter((t) => (t.exploredBy ?? []).includes(aiIndex));
    // Prefer water the AI has explored that sits 4-9 hexes from its assets:
    // close enough to trigger the naval response, far enough not to be an
    // instant ambush.
    const near = explored.filter((t) => {
      const d = this.nearestAiAssetDistance(aiIndex, t);
      return Number.isFinite(d) && d >= 4 && d <= 9;
    });
    const pool = near.length > 0 ? near : explored.length > 0 ? explored : water;
    if (pool.length === 0) return null;
    return pickRandom(pool) ?? null;
  }

  /** Next free pirate unit id (`pirate-N`), matching natural spawn ids. */
  private nextPirateId(): string {
    const used = new Set<string>();
    for (const t of this.host.sim!.map.tiles) if (t.unit && t.unit.type === UnitType.PIRATE) used.add(t.unit.id);
    let n = 1;
    while (used.has(`pirate-${n}`)) n++;
    return `pirate-${n}`;
  }

  /** Cheat (single-player only): spawns 5 pirates near randomly chosen AI
   *  tribes so their naval response can be observed. Returns true when at
   *  least one pirate was placed. */
  cheatSpawnPirates(): boolean {
    if (!this.host.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return false;
    const local = this.host.sim.players[store.localPlayerIndex];
    if (!local) return false;
    const ais = this.host.sim.players.filter(
      (p) => p.index !== local.index && p.isActive && !p.isHuman,
    );
    if (ais.length === 0) return false;
    let spawned = 0;
    for (let i = 0; i < 5; i++) {
      const ai = pickRandom(ais)!;
      const tile = this.pirateSpawnTileFor(ai.index);
      if (!tile) continue;
      tile.unit = makeUnit(PIRATE_OWNER, UnitType.PIRATE, tile.q, tile.r, {
        id: this.nextPirateId(),
      });
      spawned++;
    }
    if (spawned === 0) return false;
    this.host.syncStore();
    this.host.saveGame();
    this.host.render();
    return true;
  }

  /** Cheat (single-player only): jumps to the next `season` and plays the
   *  change (ice freezing / thawing). Returns true when applied. */
  cheatSetSeason(season: Season): Promise<boolean> {
    const store = useGameStore.getState();
    if (!this.host.sim || store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return Promise.resolve(false);
    let applied = false;
    return this.host.enqueue(async () => {
      if (!this.host.sim || this.host.sim.gameOver) return;
      const preExplored = this.host.exploredKeysFor(store.localPlayerIndex);
      applied = this.host.sim.forceSeason(season);
      if (!applied) return;
      this.host.saveGame();
      await this.host.presentEvents(this.host.sim.drainEvents(), preExplored);
      this.host.syncStore();
    }).then(() => applied);
  }

  /** Cheat (single-player only): starts a weather event of `type` right now and
   *  plays it. Returns true when applied. */
  cheatStartWeather(type: WeatherType): Promise<boolean> {
    const store = useGameStore.getState();
    if (!this.host.sim || store.screen !== Screen.GAME || store.netMode !== NetMode.SINGLE) return Promise.resolve(false);
    let applied = false;
    return this.host.enqueue(async () => {
      if (!this.host.sim || this.host.sim.gameOver) return;
      const preExplored = this.host.exploredKeysFor(store.localPlayerIndex);
      applied = this.host.sim.forceWeather(type);
      if (!applied) return;
      this.host.saveGame();
      await this.host.presentEvents(this.host.sim.drainEvents(), preExplored);
      this.host.syncStore();
    }).then(() => applied);
  }

  /** Cheat: toggles AI decision logging; returns the new on/off state. */
  cheatToggleAiLogs(): boolean {
    return setAiLogging(!aiLoggingEnabled());
  }
}
