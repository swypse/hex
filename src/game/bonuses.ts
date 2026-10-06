import { BonusKind, BottleEffect, GameEventType, SkillId } from '@enums';
import { bonusEligibleFor, explorerPath, findClosestVillage, revealExplorerPath } from './map/bonus';
import { BOTTLE_HEAL, BOTTLE_MONEY, bottleCollectableFor, collectExpiredBottles, randomBottleEffectKind, trySpawnBottle } from './map/bottles';
import { type GameEvent } from './events';
import type { GameMap, MapTile } from './map/map-gen';
import type { Player } from './players';
import { type PlayerStats } from './score';
import { randomUnopenedSkill } from './skills';
import { addStock } from './economy/stock';
import { type Unit, UNIT_TYPES } from './units/units';
import { upgradeVillage } from './economy/village';

import type { SimContext } from './sim-context';

/** Map bonuses and floating bottles: claiming, rewards, spawning and expiry. */
export class Bonuses {
  constructor(private readonly ctx: SimContext) {}

  private get map(): GameMap {
    return this.ctx.map;
  }

  private get turn(): number {
    return this.ctx.turn;
  }

  private get rng(): () => number {
    return this.ctx.rng;
  }

  private get currentPlayer(): Player {
    return this.ctx.currentPlayer;
  }

  private emit(e: GameEvent): void {
    this.ctx.emit(e);
  }

  private statsOf(player: Player): PlayerStats {
    return this.ctx.statsOf(player);
  }

  private emitScoreFly(playerIndex: number, amount: number, tile: MapTile): void {
    this.ctx.emitScoreFly(playerIndex, amount, tile);
  }

  doClaimBonus(): boolean {
    const player = this.currentPlayer;
    const tiles = bonusEligibleFor(this.map, player.index, this.turn);
    if (tiles.length === 0) return false;
    for (const t of tiles) {
      const bonus = t.bonus;
      if (!bonus) continue;
      const kind = bonus.kind;
      t.bonus = null;
      if (t.unit) {
        t.unit.hasMoved = true;
        t.unit.hasAttacked = true;
        t.unit.hasHealed = true;
      }
      const result = this.applyBonus(t, kind, player);
      this.statsOf(player).bonusesCollected += 1;
      this.emit({
        type: GameEventType.BONUS_CLAIMED,
        q: t.q,
        r: t.r,
        kind: result.kind,
        playerIndex: player.index,
        skill: result.skill,
      });
    }
    return true;
  }

  private applyBonus(tile: MapTile, kind: BonusKind, player: Player): { kind: BonusKind; skill?: SkillId } {
    switch (kind) {
      case BonusKind.MONEY:
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: BonusKind.MONEY };
      case BonusKind.RESOURCES:
        // The materials go to the village nearest to the bonus.
        const nearest = findClosestVillage(this.map, tile, player.index);
        if (nearest) addStock(nearest, { wood: 10, stone: 5, ore: 5 });
        return { kind: BonusKind.RESOURCES };
      case BonusKind.VILLAGE_UPGRADE: {
        const village = findClosestVillage(this.map, tile, player.index);
        if (village) {
          upgradeVillage(this.map, village, this.rng);
          this.statsOf(player).villageUpgrades += 1;
          this.emit({
            type: GameEventType.VILLAGE_UPGRADED,
            q: village.q,
            r: village.r,
            level: village.settlement!.level,
            playerIndex: player.index,
          });
          return { kind: BonusKind.VILLAGE_UPGRADE };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: BonusKind.MONEY };
      }
      case BonusKind.SKILL: {
        const skill = randomUnopenedSkill(player, this.rng);
        if (skill) {
          player.skills.push(skill);
          return { kind: BonusKind.SKILL, skill };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: BonusKind.MONEY };
      }
      case BonusKind.EXPLORER: {
        const path = explorerPath(this.map, tile, this.rng, player.index);
        revealExplorerPath(this.map, tile, path, player.index);
        this.emit({ type: GameEventType.EXPLORER, q: tile.q, r: tile.r, path, playerIndex: player.index });
        return { kind: BonusKind.EXPLORER };
      }
    }
  }

  /** Collects a bottle the current player's ship has reached. Consumes the
   *  ship's whole turn and applies a random effect. */
  doGetBottle(): boolean {
    const player = this.currentPlayer;
    const tile = bottleCollectableFor(this.map, player.index, this.turn)[0];
    if (!tile?.bottle || !tile.unit) return false;
    const unit = tile.unit;
    const kind = randomBottleEffectKind(this.rng);
    let skill: SkillId | undefined;
    if (kind === BottleEffect.MONEY) {
      player.resources.money += BOTTLE_MONEY;
      this.emitScoreFly(player.index, BOTTLE_MONEY, tile);
    } else if (kind === BottleEffect.SKILL) {
      const s = randomUnopenedSkill(player, this.rng);
      if (s) {
        player.skills.push(s);
        skill = s;
      } else {
        player.resources.money += BOTTLE_MONEY;
        this.emitScoreFly(player.index, BOTTLE_MONEY, tile);
      }
    } else {
      unit.hp = Math.min(UNIT_TYPES[unit.type].maxHp, unit.hp + BOTTLE_HEAL);
    }
    unit.hasMoved = true;
    unit.hasAttacked = true;
    unit.hasHealed = true;
    delete (tile as { bottle?: unknown }).bottle;
    this.emit({
      type: GameEventType.BOTTLE_COLLECTED,
      q: tile.q,
      r: tile.r,
      kind: skill !== undefined ? BottleEffect.SKILL : kind,
      playerIndex: player.index,
      skill,
    });
    return true;
  }

  /** AI ships fish out any bottle they are standing on at the start of their
   *  turn, before planning other actions. */
  collectAiBottles(playerIndex: number): void {
    while (bottleCollectableFor(this.map, playerIndex, this.turn).length > 0) {
      this.doGetBottle();
    }
  }

  touchBonus(tile: MapTile, unit: Unit): void {
    if (tile.bonus) {
      tile.bonus.claimer = unit.owner;
      tile.bonus.arrivalTurn = this.turn;
    }
  }

  /** Age out old bottles and maybe float a new one in each third turn. */
  runBottleTurn(): void {
    collectExpiredBottles(this.map, this.turn);
    trySpawnBottle(this.map, this.turn, this.rng);
  }
}
