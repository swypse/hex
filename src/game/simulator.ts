import { planAiActions, logAiTurnStart, aiLoggingEnabled, formatAiAction, type AiActionMarker } from './ai';
import { buildingIncome, buildBuilding, canUsePort } from './buildings';
import { captureVillage, setCaptureReady, villageIncomeTotal } from './capture';
import { attackableTargets, missChanceFor, performAttack } from './combat';
import { buildBridge } from './bridges';
import { buildRoad } from './roads';
import { GameEvent, BuildingKind } from './events';
import { bonusEligibleFor, explorerPath, findClosestVillage, revealExplorerPath, type BonusKind } from './bonus';
import { bonusScoreFor, captureWinnerIndex, computeWinner, GameMode, expectedTurnsFor } from './gameMode';
import { hexDistance, hexNeighbors } from './hex';
import type { GameMap, MapTile } from './mapGen';
import type { Player } from './players';
import { PlayerStats } from './score';
import { canAfford, pay, villageUpgradeCost } from './resources';
import { awardScore, awardTempleScores, CAPTURE_SCORE, COMBO_SCORE, EMPTY_STATS, KILL_SCORE, PIRATE_KILL_SCORE, SKILL_SCORE, UPGRADE_SCORE } from './score';
import { hasSkill, openSkill as applySkill, randomUnopenedSkill, SkillId } from './skills';
import { evaluateAchievements, awardAchievementScores, currentlyMetIds, type AchievementId } from './achievements';
import { gainShipAbility, revertShip, upgradeShip } from './ship';
import { moveRange, canAttack, canDisband, canHeal, canMove, disbandCost, healUnit, makeUnit, unitMaintenance, PIRATE_OWNER, UNIT_TYPES, Unit, UnitType, UNIT_MOVEMENT } from './units';
import { reachableTargets, moveUnit, pathBetween, tileAt } from './selection';
import { spawnUnit } from './spawn';
import { exploreUnitPath } from './explore';
import { knownTribesFor } from './discovery';
import { isWaterType, TileType } from './tileTypes';
import { BOTTLE_HEAL, BOTTLE_MONEY, bottleCollectableFor, collectExpiredBottles, randomBottleEffectKind, touchBottle, trySpawnBottle } from './bottles';
import { upgradeVillage, buildWall as applyWall, canBuildWall, WALL_COST } from './village';
import { SeededRandom } from '../util/random';
import type { GameStateSnapshot } from './state';

export type Command =
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'build'; q: number; r: number; kind: BuildingKind }
  | { type: 'buildWall'; q: number; r: number }
  | { type: 'buildRoad'; q: number; r: number }
  | { type: 'buildBridge'; q: number; r: number }
  | { type: 'upgradeVillage'; q: number; r: number }
  | { type: 'upgradeShip'; unitId: string }
  | { type: 'openSkill'; skill: SkillId }
  | { type: 'heal'; unitId: string }
  | { type: 'disband'; unitId: string }
  | { type: 'shipLanding'; unitId: string; q: number; r: number }
  | { type: 'claimBonus' }
  | { type: 'getBottle' }
  | { type: 'endTurn' }
  | { type: 'giveToAI'; playerIndex: number }
  | { type: 'forfeit'; playerIndex: number };

/** Commands whose outcome on the authoritative sim is fully deterministic and
 *  therefore safe for a client to predict locally and replay later. */
export const PREDICTABLE_COMMAND_TYPES: ReadonlySet<Command['type']> = new Set([
  'move',
  'capture',
  'spawn',
  'build',
  'buildWall',
  'buildRoad',
  'buildBridge',
  'upgradeVillage',
  'upgradeShip',
  'openSkill',
  'heal',
  'disband',
  'shipLanding',
]);

export class Simulator {
  readonly map: GameMap;
  players: Player[];
  mode: GameMode;
  turn: number;
  currentPlayerIndex: number;
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;

  private rng: () => number;
  private aiRng: () => SeededRandom;
  private disablePirates: boolean;
  private events: GameEvent[] = [];
  private achievementBaseline = new Map<number, Set<AchievementId>>();

  constructor(
    map: GameMap,
    players: Player[],
    mode: GameMode,
    opts: { rng?: () => number; aiRng?: () => SeededRandom; disablePirates?: boolean } = {},
  ) {
    this.map = map;
    this.players = players;
    this.mode = mode;
    this.rng = opts.rng ?? Math.random;
    this.aiRng = opts.aiRng ?? (() => new SeededRandom(Math.floor(Math.random() * 100000)));
    this.disablePirates = opts.disablePirates ?? false;
    this.turn = 1;
    this.currentPlayerIndex = 0;
    this.gameOver = false;
    this.winnerIndex = null;
    this.expectedTurns = expectedTurnsFor(players.length);
    this.bonusAwarded = false;
    this.ensureAchievementBaseline();
  }

  static fromSnapshot(snap: GameStateSnapshot): Simulator {
    const sim = new Simulator(snap.map, snap.players, snap.mode);
    sim.turn = snap.turn;
    sim.currentPlayerIndex = snap.currentPlayerIndex;
    sim.gameOver = snap.gameOver;
    sim.winnerIndex = snap.winnerIndex;
    sim.expectedTurns = snap.expectedTurns;
    sim.bonusAwarded = snap.bonusAwarded;
    return sim;
  }

  snapshot(): GameStateSnapshot {
    return structuredClone({
      map: this.map,
      players: this.players,
      mode: this.mode,
      turn: this.turn,
      currentPlayerIndex: this.currentPlayerIndex,
      gameOver: this.gameOver,
      winnerIndex: this.winnerIndex,
      expectedTurns: this.expectedTurns,
      bonusAwarded: this.bonusAwarded,
    });
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  get currentPlayer(): Player {
    return this.players[this.currentPlayerIndex]!;
  }

  startGame(): void {
    this.markCaptureReadyFor(0);
    this.emit({ type: 'turnStarted', playerIndex: 0, turn: this.turn });
  }

  applyCommand(cmd: Command): boolean {
    let ok = false;
    switch (cmd.type) {
      case 'move':
        ok = this.doMove(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'attack':
        ok = this.doAttack(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'capture':
        ok = this.doCapture(cmd.q, cmd.r, cmd.unitId);
        break;
      case 'spawn':
        ok = this.doSpawn(cmd.q, cmd.r, cmd.unitType);
        break;
      case 'build':
        ok = this.doBuild(cmd.q, cmd.r, cmd.kind);
        break;
      case 'buildWall':
        ok = this.doBuildWall(cmd.q, cmd.r);
        break;
      case 'buildRoad':
        ok = this.doBuildRoad(cmd.q, cmd.r);
        break;
      case 'buildBridge':
        ok = this.doBuildBridge(cmd.q, cmd.r);
        break;
      case 'upgradeVillage':
        ok = this.doUpgradeVillage(cmd.q, cmd.r);
        break;
      case 'upgradeShip':
        ok = this.doUpgradeShip(cmd.unitId);
        break;
      case 'openSkill':
        ok = this.doOpenSkill(cmd.skill);
        break;
      case 'heal':
        ok = this.doHeal(cmd.unitId);
        break;
      case 'disband':
        ok = this.doDisband(cmd.unitId);
        break;
      case 'shipLanding':
        ok = this.doShipLanding(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'claimBonus':
        ok = this.doClaimBonus();
        break;
      case 'getBottle':
        ok = this.doGetBottle();
        break;
      case 'endTurn':
        this.doEndTurn();
        ok = true;
        break;
      case 'giveToAI':
        ok = this.doGiveToAI(cmd.playerIndex);
        break;
      case 'forfeit':
        ok = this.doForfeit(cmd.playerIndex);
        break;
    }
    this.syncDiscoveries();
    if (ok && !this.gameOver) this.evaluateAchievementsForAll();
    return ok;
  }

  private evaluateAchievementsForAll(): void {
    this.ensureAchievementBaseline();
    for (const p of this.players) {
      const skip = this.achievementBaseline.get(p.index) ?? new Set<AchievementId>();
      for (const id of evaluateAchievements(this.map, p, skip)) {
        this.emit({ type: 'achievementUnlocked', playerIndex: p.index, achievement: id });
      }
    }
  }

  private ensureAchievementBaseline(): void {
    for (const p of this.players) {
      if (!this.achievementBaseline.has(p.index)) {
        this.achievementBaseline.set(p.index, new Set(currentlyMetIds(this.map, p)));
      }
    }
  }

  static isPredictable(cmd: Command): boolean {
    return PREDICTABLE_COMMAND_TYPES.has(cmd.type);
  }

  private syncDiscoveries(): void {
    for (const p of this.players) {
      const visible = knownTribesFor(this.map, this.players, p.index);
      const known = new Set(p.knownTribes ?? []);
      for (const tribe of visible) known.add(tribe);
      p.knownTribes = [...known];
    }
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private emitScoreFly(playerIndex: number, amount: number, tile: MapTile): void {
    this.emit({ type: 'scoreFly', playerIndex, amount, q: tile.q, r: tile.r });
  }

  private findUnit(unitId: string): Unit | undefined {
    const tile = this.map.tiles.find((t) => t.unit?.id === unitId);
    return tile?.unit ?? undefined;
  }

  private autoHealFor(playerIndex: number): void {
    for (const t of this.map.tiles) {
      const u = t.unit;
      if (u && u.owner === playerIndex && canHeal(u)) {
        healUnit(u);
        this.emit({ type: 'healed', unitId: u.id, playerIndex });
      }
    }
  }

  private statsOf(player: Player): PlayerStats {
    player.stats ??= { ...EMPTY_STATS };
    return player.stats;
  }

  private markCaptureReadyFor(playerIndex: number): void {
    for (const t of this.map.tiles) {
      if (t.settlement && t.settlement.owner !== playerIndex && t.unit && t.unit.owner === playerIndex) {
        t.settlement.captureReady = true;
      }
    }
  }

  /** A capture-ready enemy/free village loses its readiness the moment the
   *  standing unit leaves: coming back is treated as a fresh "first turn". */
  private clearAbandonedReady(tile: MapTile | undefined, owner: number): void {
    if (!tile?.settlement) return;
    if (tile.settlement.owner === owner) return;
    if (tile.settlement.captureReady) tile.settlement.captureReady = false;
  }

  private doMove(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (!canMove(unit)) return false;
    const player = this.players[unit.owner]!;
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (unit.shipLevel !== undefined && target.terrain !== TileType.Water) return false;
    const reachable = reachableTargets(this.map, unit, moveRange(unit, tileAt(this.map, unit.q, unit.r), this.map), canClimb, canDock, unit.owner);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, { q, r }, canClimb, unit.shipLevel !== undefined, canDock, unit.owner);
    const shipLevel = unit.shipLevel;
    const fromTile = tileAt(this.map, from.q, from.r);
    moveUnit(this.map, unit, target);
    exploreUnitPath(this.map, path, unit, unit.owner);
    this.clearAbandonedReady(fromTile, unit.owner);
    this.touchBonus(target, unit);
    touchBottle(target, this.turn);
    if (canUsePort(target, player) && unit.shipLevel === undefined) {
      gainShipAbility(unit);
      unit.hasAttacked = true;
    }
    this.emit({ type: 'unitMoved', unitId, from, path, to: { q, r }, shipLevel });
    return true;
  }

  private doAttack(unitId: string, q: number, r: number): boolean {
    const attacker = this.findUnit(unitId);
    if (!attacker || attacker.owner !== this.currentPlayerIndex || !canAttack(attacker)) return false;
    const target = tileAt(this.map, q, r);
    if (!target?.unit) return false;
    if (target.unit.owner === attacker.owner) return false;
    if (!attackableTargets(this.map, attacker, attacker.owner).some((t) => t.q === q && t.r === r)) return false;
    const attackerPlayer = this.players[attacker.owner]!;
    const targetPlayer = target.unit.owner >= 0 ? this.players[target.unit.owner] : null;
    const targetId = target.unit.id;
    const targetWasPirate = target.unit.type === 'pirate';
    const attackerTilePos = { q: attacker.q, r: attacker.r };
    const targetTilePos = { q: target.q, r: target.r };
    const attackerPre = { type: attacker.type, owner: attacker.owner, shipLevel: attacker.shipLevel, hp: attacker.hp };
    const targetPre = { type: target.unit.type, owner: target.unit.owner, shipLevel: target.unit.shipLevel, hp: target.unit.hp };
    const result = performAttack(this.map, attacker, target, this.rng, missChanceFor(attackerPlayer));
    // A melee kill makes the attacker advance off its own tile; if that tile
    // was a capture-ready enemy/free village, leaving it resets readiness.
    const originTile = tileAt(this.map, attackerTilePos.q, attackerTilePos.r);
    if (originTile && originTile.unit !== attacker) this.clearAbandonedReady(originTile, attacker.owner);
    if (result.targetDied) {
      attackerPlayer.kills += 1;
      const pts = targetWasPirate ? PIRATE_KILL_SCORE : KILL_SCORE;
      awardScore(attackerPlayer, pts);
      this.emitScoreFly(attackerPlayer.index, pts, target);
      if (targetWasPirate) {
        this.statsOf(attackerPlayer).pirateKills += 1;
      } else if (targetPlayer) {
        this.statsOf(targetPlayer).killedUnits += 1;
      }
      if (targetPre.shipLevel !== undefined) this.statsOf(attackerPlayer).enemyShipsKilled += 1;
    }
    if (result.attackerDied && targetPlayer) {
      targetPlayer.kills += 1;
      awardScore(targetPlayer, KILL_SCORE);
      this.statsOf(attackerPlayer).killedUnits += 1;
      const attackerTile = tileAt(this.map, attacker.q, attacker.r);
      if (attackerTile) this.emitScoreFly(targetPlayer.index, KILL_SCORE, attackerTile);
    }
    if (target.unit === attacker) {
      exploreUnitPath(this.map, [{ q: attacker.q, r: attacker.r }], attacker, attacker.owner);
    }
    this.emit({
      type: 'attack',
      attackerId: unitId,
      targetId,
      attackerIndex: attacker.owner,
      targetIndex: targetPlayer ? targetPlayer.index : PIRATE_OWNER,
      attackerTile: attackerTilePos,
      targetTile: targetTilePos,
      attackerDamage: result.attackerDamage,
      targetDamage: result.targetDamage,
      missed: result.missed,
      attackerDied: result.attackerDied,
      targetDied: result.targetDied,
      attackerPre,
      targetPre,
    });
    // A land knight that kills may attack again in the same turn. Every 3 kills
    // in one turn triggers a Combo kill bonus of 30 points at the kill tile.
    if (attacker.type === 'knight' && attacker.shipLevel === undefined) {
      const killed = result.targetDied && !result.attackerDied;
      attacker.canExtraAttack = killed;
      if (killed) {
        attacker.killsThisTurn = (attacker.killsThisTurn ?? 0) + 1;
        if (attacker.killsThisTurn === 3) {
          awardScore(attackerPlayer, COMBO_SCORE);
          this.emitScoreFly(attackerPlayer.index, COMBO_SCORE, target);
          this.statsOf(attackerPlayer).knightCombos += 1;
          this.emit({ type: 'knightCombo', unitId, q: target.q, r: target.r, playerIndex: attacker.owner });
        }
      }
    }
    return true;
  }

  private doCapture(q: number, r: number, unitId: string): boolean {
    const village = tileAt(this.map, q, r);
    if (!village?.settlement) return false;
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (village.unit !== unit) return false;
    if (village.settlement.owner === unit.owner || !village.settlement.captureReady) return false;
    const oldOwner = village.settlement.owner;
    const result = captureVillage(this.map, village, unit);
    const capturer = this.players[unit.owner]!;
    awardScore(capturer, CAPTURE_SCORE);
    this.statsOf(capturer).villagesCaptured += 1;
    this.emitScoreFly(capturer.index, CAPTURE_SCORE, village);
    if (result.ownerDied) {
      this.statsOf(capturer).tribesEliminated += 1;
      for (const p of this.players) {
        const owned = this.map.tiles.filter((t) => t.settlement && t.settlement.owner === p.index);
        if (owned.length === 0) p.isActive = false;
      }
    }
    this.emit({ type: 'captured', q, r, oldOwner, newOwner: unit.owner, ownerDied: result.ownerDied });
    return true;
  }

  private doSpawn(q: number, r: number, unitType: UnitType): boolean {
    const village = tileAt(this.map, q, r);
    if (!village || village.settlement?.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    if (spawnUnit(this.map, village, unitType, player)) {
      this.emit({ type: 'spawned', unitType, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doBuild(q: number, r: number, kind: BuildingKind): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBuilding(this.map, tile, kind, player)) {
      if (tile.building?.kind === 'temple' || tile.building?.kind === 'forestTemple') tile.building.bornTurn = this.turn;
      this.emit({ type: 'built', kind, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private growTemples(): void {
    for (const t of this.map.tiles) {
      const b = t.building;
      if (!b || (b.kind !== 'temple' && b.kind !== 'forestTemple') || b.level >= 4) continue;
      const born = b.bornTurn ?? this.turn;
      if (this.turn - born >= 2 && (this.turn - born) % 2 === 0) {
        b.level += 1;
        this.emit({ type: 'templeGrown', q: t.q, r: t.r, level: b.level, playerIndex: t.ownedBy ?? -1 });
      }
    }
  }

  private doBuildRoad(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildRoad(this.map, tile, player)) {
      this.emit({ type: 'roadBuilt', q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doBuildBridge(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBridge(this.map, tile, player)) {
      this.emit({ type: 'bridgeBuilt', q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doUpgradeVillage(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile?.settlement || tile.settlement.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    const cost = villageUpgradeCost(tile.settlement.level);
    if (!canAfford(player.resources, cost)) return false;
    player.resources = pay(player.resources, cost);
    upgradeVillage(this.map, tile);
    awardScore(player, UPGRADE_SCORE);
    this.statsOf(player).villageUpgrades += 1;
    this.emit({ type: 'villageUpgraded', q, r, level: tile.settlement.level, playerIndex: player.index });
    this.emitScoreFly(player.index, UPGRADE_SCORE, tile);
    return true;
  }

  private doBuildWall(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile?.settlement) return false;
    const player = this.currentPlayer;
    if (!canBuildWall(tile, player)) return false;
    if (!applyWall(tile, player)) return false;
    this.emit({ type: 'wallBuilt', q, r, playerIndex: player.index });
    return true;
  }

  private doUpgradeShip(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const player = this.currentPlayer;
    if (upgradeShip(unit, tile, player)) {
      exploreUnitPath(this.map, [{ q: unit.q, r: unit.r }], unit, unit.owner);
      this.emit({ type: 'shipUpgraded', unitId, level: unit.shipLevel!, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doOpenSkill(skill: SkillId): boolean {
    const player = this.currentPlayer;
    if (applySkill(player, skill)) {
      awardScore(player, SKILL_SCORE);
      this.emit({ type: 'skillOpened', playerIndex: player.index, skill });
      this.emitScoreFly(player.index, SKILL_SCORE, tileAt(this.map, 0, 0)!);
      return true;
    }
    return false;
  }

  private doHeal(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex || !canHeal(unit)) return false;
    healUnit(unit);
    this.emit({ type: 'healed', unitId, playerIndex: unit.owner });
    return true;
  }

  private doDisband(unitId: string): boolean {
    const tile = this.map.tiles.find((t) => t.unit?.id === unitId);
    if (!tile?.unit) return false;
    const unit = tile.unit;
    if (unit.owner !== this.currentPlayerIndex) return false;
    if (!canDisband(unit)) return false;
    const player = this.players[unit.owner]!;
    const cost = disbandCost(unit);
    if (!canAfford(player.resources, { wood: 0, stone: 0, money: cost, ore: 0 })) return false;
    player.resources = pay(player.resources, { wood: 0, stone: 0, money: cost, ore: 0 });
    const q = tile.q;
    const r = tile.r;
    tile.unit = null;
    this.emit({ type: 'unitDisbanded', unitId, q, r, playerIndex: unit.owner });
    return true;
  }

  private doShipLanding(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.shipLevel === undefined || unit.owner !== this.currentPlayerIndex) return false;
    const target = tileAt(this.map, q, r);
    if (!target || target.terrain === TileType.Water) return false;
    const player = this.players[unit.owner]!;
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const reachable = reachableTargets(this.map, unit, moveRange(unit, tileAt(this.map, unit.q, unit.r), this.map), canClimb, canDock, unit.owner);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, { q, r }, canClimb, true, canDock, unit.owner);
    const shipLevel = unit.shipLevel;
    moveUnit(this.map, unit, target);
    exploreUnitPath(this.map, path, unit, unit.owner);
    this.touchBonus(target, unit);
    touchBottle(target, this.turn);
    revertShip(unit);
    // Landing consumes the whole turn: the unit may not move, attack, or heal
    // again until the next turn.
    unit.hasMoved = true;
    unit.hasAttacked = true;
    unit.hasHealed = true;
    unit.hasLanded = true;
    this.emit({ type: 'unitMoved', unitId, from, path, to: { q, r }, shipLevel });
    this.emit({ type: 'shipReverted', unitId });
    return true;
  }

  private doClaimBonus(): boolean {
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
        type: 'bonusClaimed',
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
      case 'money':
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      case 'resources':
        player.resources.wood += 10;
        player.resources.stone += 5;
        player.resources.ore += 5;
        return { kind: 'resources' };
      case 'villageUpgrade': {
        const village = findClosestVillage(this.map, tile, player.index);
        if (village) {
          upgradeVillage(this.map, village);
          this.statsOf(player).villageUpgrades += 1;
          this.emit({
            type: 'villageUpgraded',
            q: village.q,
            r: village.r,
            level: village.settlement!.level,
            playerIndex: player.index,
          });
          return { kind: 'villageUpgrade' };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      }
      case 'skill': {
        const skill = randomUnopenedSkill(player, this.rng);
        if (skill) {
          player.skills.push(skill);
          return { kind: 'skill', skill };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      }
      case 'explorer': {
        const path = explorerPath(this.map, tile, this.rng, player.index);
        revealExplorerPath(this.map, tile, path, player.index);
        this.emit({ type: 'explorer', q: tile.q, r: tile.r, path, playerIndex: player.index });
        return { kind: 'explorer' };
      }
    }
  }

  /** Collects a bottle the current player's ship has reached. Consumes the
   *  ship's whole turn and applies a random effect. */
  private doGetBottle(): boolean {
    const player = this.currentPlayer;
    const tile = bottleCollectableFor(this.map, player.index, this.turn)[0];
    if (!tile?.bottle || !tile.unit) return false;
    const unit = tile.unit;
    const kind = randomBottleEffectKind(this.rng);
    let skill: SkillId | undefined;
    if (kind === 'money') {
      player.resources.money += BOTTLE_MONEY;
      this.emitScoreFly(player.index, BOTTLE_MONEY, tile);
    } else if (kind === 'skill') {
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
      type: 'bottleCollected',
      q: tile.q,
      r: tile.r,
      kind: skill !== undefined ? 'skill' : kind,
      playerIndex: player.index,
      skill,
    });
    return true;
  }

  /** AI ships fish out any bottle they are standing on at the start of their
   *  turn, before planning other actions. */
  private collectAiBottles(playerIndex: number): void {
    while (bottleCollectableFor(this.map, playerIndex, this.turn).length > 0) {
      this.doGetBottle();
    }
  }

  private touchBonus(tile: MapTile, unit: Unit): void {
    if (tile.bonus) {
      tile.bonus.claimer = unit.owner;
      tile.bonus.arrivalTurn = this.turn;
    }
  }

  /** Host-only: hand a disconnected human's seat to the AI. */
  private doGiveToAI(playerIndex: number): boolean {
    const player = this.players[playerIndex];
    if (!player || !player.isHuman) return false;
    player.isHuman = false;
    this.emit({ type: 'aiTakeover', playerIndex });
    return true;
  }

  /** Host-only: forfeit a disconnected player — free their villages (ownerless),
   *  remove all their units and territories, and mark the tribe inactive so the
   *  end conditions can resolve. */
  private doForfeit(playerIndex: number): boolean {
    const player = this.players[playerIndex];
    if (!player || !player.isActive) return false;
    for (const t of this.map.tiles) {
      if (t.settlement && t.settlement.owner === playerIndex) {
        t.settlement.owner = null;
        t.settlement.captureReady = false;
      }
      if (t.unit && t.unit.owner === playerIndex) t.unit = null;
      if (t.ownedBy === playerIndex) {
        t.ownedBy = null;
        t.claimedByVillage = null;
      } else if (t.claimedByVillage && t.settlement?.owner === playerIndex) {
        // handled above; nothing extra
      }
    }
    player.isActive = false;
    this.emit({ type: 'playerForfeited', playerIndex });
    if (!this.gameOver) this.checkEndConditions();
    return true;
  }

  private doEndTurn(): void {
    if (this.gameOver) return;
    this.autoHealFor(this.currentPlayerIndex);
    let guard = 0;
    for (;;) {
      if (guard++ > 64) break;
      const next = (this.currentPlayerIndex + 1) % this.players.length;
      if (next === 0) {
        this.runPirateTurn();
        this.applyIncome();
        this.turn += 1;
        this.runBottleTurn();
        this.growTemples();
        this.resetUnitFlags();
        this.evaluateAchievementsForAll();
        if (this.checkEndConditions()) return;
      }
      this.currentPlayerIndex = next;
      if (!this.players[next]!.isActive) continue;
      if (!this.players[next]!.isHuman) {
        this.runAiTurn(next);
        this.autoHealFor(next);
        continue;
      }
      this.markCaptureReadyFor(next);
      this.emit({ type: 'turnStarted', playerIndex: next, turn: this.turn });
      return;
    }
  }

  private runAiTurn(playerIndex: number): void {
    const ai = this.players[playerIndex]!;
    logAiTurnStart(ai, this.turn);
    this.doClaimBonus();
    this.collectAiBottles(playerIndex);
    this.markCaptureReadyFor(playerIndex);
    this.emit({ type: 'aiTurn', playerIndex });
    const markers: AiActionMarker[] = [];
    const actions = planAiActions(this.map, ai, this.aiRng(), this.mode, markers, this.turn);
    let actionNo = 0;
    for (const a of actions) {
      actionNo += 1;
      let ok = false;
      switch (a.type) {
        case 'upgrade':
          ok = this.doUpgradeVillage(a.q, a.r);
          break;
        case 'move':
          ok = this.doMove(a.unitId, a.q, a.r);
          break;
        case 'attack':
          ok = this.doAttack(a.unitId, a.q, a.r);
          break;
        case 'spawn':
          ok = this.doSpawn(a.q, a.r, a.unitType);
          break;
        case 'capture':
          ok = this.doCapture(a.q, a.r, a.unitId);
          break;
        case 'heal':
          ok = this.doHeal(a.unitId);
          break;
        case 'build':
          ok = this.doBuild(a.q, a.r, a.kind);
          break;
        case 'buildRoad':
          ok = this.doBuildRoad(a.q, a.r);
          break;
        case 'buildBridge':
          ok = this.doBuildBridge(a.q, a.r);
          break;
        case 'upgradeShip':
          ok = this.doUpgradeShip(a.unitId);
          break;
        case 'openSkill':
          ok = this.doOpenSkill(a.skill);
          break;
      }
      if (aiLoggingEnabled()) {
        const marker = actionNo - 1 < markers.length ? markers[actionNo - 1]! : undefined;
        const tag = marker ? `<${marker.label}>${marker.note}` : '<unknown>';
        console.log(`[AI]   exec ${ok ? 'OK  ' : 'FAIL'} #${actionNo} ${formatAiAction(a)} ${tag}`);
      }
    }
    this.evaluateAchievementsForAll();
  }

  private runPirateTurn(): void {
    if (this.disablePirates) return;
    this.trySpawnPirate();
    const pirates = this.map.tiles.filter((t) => t.unit && t.unit.type === 'pirate').map((t) => t.unit!);
    const acted = new Set<string>();
    for (const u of pirates) {
      if (acted.has(u.id)) continue;
      acted.add(u.id);
      this.pirateAct(u);
    }
  }

  /** Age out old bottles and maybe float a new one in each third turn. */
  private runBottleTurn(): void {
    collectExpiredBottles(this.map, this.turn);
    trySpawnBottle(this.map, this.turn, this.rng);
  }

  private trySpawnPirate(): void {
    if (this.turn <= 5 || this.turn % 2 !== 1) return;
    if (this.rng() >= 0.15) return;
    const edge = this.map.tiles.filter(
      (t) => hexDistance({ q: 0, r: 0 }, t) === this.map.radius && isWaterType(t.terrain) && !t.unit,
    );
    if (edge.length === 0) return;
    const spot = edge[Math.floor(this.rng() * edge.length)]!;
    const used = new Set<string>();
    for (const t of this.map.tiles) if (t.unit && t.unit.type === 'pirate') used.add(t.unit.id);
    let n = 1;
    while (used.has(`pirate-${n}`)) n++;
    spot.unit = makeUnit(PIRATE_OWNER, 'pirate', spot.q, spot.r, { id: `pirate-${n}` });
    this.emit({ type: 'pirateSpawned', q: spot.q, r: spot.r });
  }

  private pirateAct(unit: Unit): void {
    const target = this.nearestPlayerUnitTo(unit);
    if (!target) {
      this.pirateMoveRandom(unit);
      return;
    }
    const dist = hexDistance(unit, target);
    if (dist <= unit.attackDistance) {
      const isShip = target.unit && target.unit.shipLevel !== undefined && target.unit.owner >= 0;
      // Ships can only be captured from an adjacent hex.
      if (isShip && dist === 1) {
        this.pirateTryCapture(unit, target);
      } else {
        this.pirateAttack(unit, target);
      }
    } else {
      this.pirateMoveToward(unit, target);
    }
  }

  private pirateTryCapture(pirate: Unit, targetTile: MapTile): void {
    const ship = targetTile.unit;
    if (!ship || ship.shipLevel === undefined || ship.owner < 0) return;
    const targetOwner = ship.owner;
    const success = this.rng() < 0.25;
    if (success) {
      ship.type = 'pirate';
      ship.owner = PIRATE_OWNER;
      ship.hasMoved = false;
      ship.hasAttacked = false;
      ship.hasHealed = false;
      const victim = this.players[targetOwner];
      if (victim) this.statsOf(victim).shipsCapturedByPirates += 1;
    } else {
      pirate.hp = Math.max(0, pirate.hp - 20);
      ship.hp = Math.max(0, ship.hp - 10);
      const victim = this.players[targetOwner];
      if (ship.hp <= 0) {
        targetTile.unit = null;
        if (victim) this.statsOf(victim).killedUnits += 1;
      }
      if (pirate.hp <= 0) {
        const pirateTile = tileAt(this.map, pirate.q, pirate.r);
        if (pirateTile && pirateTile.unit === pirate) pirateTile.unit = null;
        if (victim) {
          victim.kills += 1;
          this.statsOf(victim).pirateKills += 1;
          awardScore(victim, PIRATE_KILL_SCORE);
          if (pirateTile) this.emitScoreFly(victim.index, PIRATE_KILL_SCORE, pirateTile);
        }
      }
    }
    this.emit({ type: 'pirateCapture', q: targetTile.q, r: targetTile.r, playerIndex: targetOwner, success });
  }

  private pirateMoveRandom(unit: Unit): void {
    const DIRS = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    const start = Math.floor(this.rng() * DIRS.length);
    const steps: { q: number; r: number }[] = [];
    let pos = { q: unit.q, r: unit.r };
    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[(start + i) % DIRS.length]!;
      const first = tileAt(this.map, pos.q + d.q, pos.r + d.r);
      if (!first || !isWaterType(first.terrain) || first.unit) continue;
      for (let k = 0; k < UNIT_MOVEMENT.pirate; k++) {
        const next = tileAt(this.map, pos.q + d.q, pos.r + d.r);
        if (!next || !isWaterType(next.terrain) || next.unit) break;
        steps.push({ q: next.q, r: next.r });
        pos = { q: next.q, r: next.r };
      }
      break;
    }
    if (steps.length === 0) return;
    const from = { q: unit.q, r: unit.r };
    const to = steps[steps.length - 1]!;
    moveUnit(this.map, unit, tileAt(this.map, to.q, to.r)!);
    this.emit({ type: 'unitMoved', unitId: unit.id, from, path: steps, to });
  }

  private nearestPlayerUnitTo(unit: Unit): MapTile | null {
    let best: MapTile | null = null;
    let bestDist = Infinity;
    for (const t of this.map.tiles) {
      if (!t.unit || t.unit.owner < 0) continue;
      const d = hexDistance(unit, t);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private pirateAttack(attacker: Unit, targetTile: MapTile): void {
    const targetUnit = targetTile.unit;
    if (!targetUnit || targetUnit.owner < 0) return;
    const targetOwner = targetUnit.owner;
    const targetId = targetUnit.id;
    const attackerTilePos = { q: attacker.q, r: attacker.r };
    const targetTilePos = { q: targetTile.q, r: targetTile.r };
    const attackerPre = { type: attacker.type, owner: attacker.owner, shipLevel: attacker.shipLevel, hp: attacker.hp };
    const targetPre = { type: targetUnit.type, owner: targetUnit.owner, shipLevel: targetUnit.shipLevel, hp: targetUnit.hp };
    const result = performAttack(this.map, attacker, targetTile, this.rng);
    if (!result.missed && targetUnit.shipLevel !== undefined && targetOwner >= 0) {
      const victim = this.players[targetOwner];
      if (victim) {
        const stolen = Math.floor(victim.resources.money * 0.25);
        victim.resources.money = Math.max(0, victim.resources.money - stolen);
      }
    }
    if (result.targetDied && targetOwner >= 0) {
      const victim = this.players[targetOwner];
      if (victim) this.statsOf(victim).killedUnits += 1;
    }
    if (result.attackerDied && targetOwner >= 0) {
      const owner = this.players[targetOwner];
      if (owner) {
        owner.kills += 1;
        this.statsOf(owner).pirateKills += 1;
        awardScore(owner, PIRATE_KILL_SCORE);
        const tile = tileAt(this.map, attackerTilePos.q, attackerTilePos.r);
        if (tile) this.emitScoreFly(owner.index, PIRATE_KILL_SCORE, tile);
      }
    }
    this.emit({
      type: 'attack',
      attackerId: attacker.id,
      targetId,
      attackerIndex: PIRATE_OWNER,
      targetIndex: targetOwner,
      attackerTile: attackerTilePos,
      targetTile: targetTilePos,
      attackerDamage: result.attackerDamage,
      targetDamage: result.targetDamage,
      missed: result.missed,
      attackerDied: result.attackerDied,
      targetDied: result.targetDied,
      attackerPre,
      targetPre,
    });
  }

  private pirateMoveToward(unit: Unit, target: MapTile): void {
    // Path over water toward the closest water cell from which the pirate can
    // hit the target (its own hex when the target is a ship). Greedy straight
    // line chases stall against land barriers, so navigate instead.
    const path = this.pirateWaterPath(unit, target);
    if (path.length === 0) {
      // No reachable firing position: patrol instead of idling at the coast.
      this.pirateMoveRandom(unit);
      return;
    }
    const steps = path.slice(0, UNIT_MOVEMENT.pirate);
    const from = { q: unit.q, r: unit.r };
    const to = steps[steps.length - 1]!;
    moveUnit(this.map, unit, tileAt(this.map, to.q, to.r)!);
    this.emit({ type: 'unitMoved', unitId: unit.id, from, path: steps, to });
  }

  /** BFS over unoccupied water tiles from the pirate toward any water cell
   *  within its attack range of `target`. Returns the step cells to reach the
   *  nearest such cell (empty when already in range or unreachable). */
  private pirateWaterPath(unit: Unit, target: MapTile): { q: number; r: number }[] {
    const key = (q: number, r: number): string => `${q},${r}`;
    const from = { q: unit.q, r: unit.r };
    const fromKey = key(from.q, from.r);
    const goal = new Set<string>();
    for (const t of this.map.tiles) {
      if (!isWaterType(t.terrain)) continue;
      if (hexDistance(t, target) > unit.attackDistance) continue;
      goal.add(key(t.q, t.r));
    }
    if (goal.has(fromKey)) return [];
    const prev = new Map<string, string>();
    const seen = new Set<string>([fromKey]);
    const queue: { q: number; r: number }[] = [from];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of hexNeighbors(cur)) {
        const k = key(n.q, n.r);
        if (seen.has(k)) continue;
        const tile = tileAt(this.map, n.q, n.r);
        if (!tile || !isWaterType(tile.terrain) || tile.unit) continue;
        seen.add(k);
        prev.set(k, key(cur.q, cur.r));
        if (goal.has(k)) {
          const path: { q: number; r: number }[] = [];
          let c = { q: n.q, r: n.r };
          while (key(c.q, c.r) !== fromKey) {
            path.unshift({ q: c.q, r: c.r });
            const p = prev.get(key(c.q, c.r))!;
            const [pq, pr] = p.split(',').map(Number);
            c = { q: pq!, r: pr! };
          }
          return path;
        }
        queue.push(n);
      }
    }
    return [];
  }

  private applyIncome(): void {
    for (const player of this.players) {
      player.resources.money += villageIncomeTotal(this.map, player.index);
      const b = buildingIncome(this.map, player);
      player.resources.wood += b.wood;
      player.resources.stone += b.stone;
      player.resources.ore += b.ore;
    }
  }

  private resetUnitFlags(): void {
    for (const t of this.map.tiles) {
      if (t.unit) {
        t.unit.hasMoved = false;
        t.unit.hasAttacked = false;
        t.unit.hasHealed = false;
        t.unit.hasLanded = false;
        t.unit.canExtraAttack = false;
        t.unit.killsThisTurn = 0;
      }
    }
  }

  private checkEndConditions(): boolean {
    if (this.mode === 'turns30' && this.turn >= 30) {
      awardTempleScores(this.map, this.players);
      awardAchievementScores(this.players);
      this.endGame(computeWinner(this.players, this.map));
      return true;
    }
    if (this.mode === 'capture') {
      const w = captureWinnerIndex(this.map);
      if (w !== null) {
        awardTempleScores(this.map, this.players);
        awardAchievementScores(this.players);
        this.endGame(w);
        return true;
      }
    }
    return false;
  }

  private endGame(winnerIndex: number): void {
    const winner = this.players[winnerIndex]!;
    const bonus =
      this.mode === 'capture' && this.turn <= this.expectedTurns
        ? bonusScoreFor(this.players.length)
        : 0;
    if (bonus > 0) {
      awardScore(winner, bonus);
      this.bonusAwarded = true;
    }
    this.winnerIndex = winnerIndex;
    this.gameOver = true;
    this.emit({ type: 'gameOver', winnerIndex, bonus });
  }
}
