import { SeededRandom } from '@/util';
import { AchievementId, AiActionType, AiEngine, BonusKind, BottleEffect, BuilderExtraKind, BuildingKind, CommandType, GameEventType, GameMode, Season, SkillId, UnitType, WeatherType } from '@enums';
import { awardAchievementScores, currentlyMetIds, evaluateAchievements } from './achievements';
import { type AiActionMarker, aiLoggingEnabled, formatAiAction, logAiTurnStart, planAiActions, planAiActionsSteps } from './ai';
import type { AiAction } from './ai-types';
import { bonusEligibleFor, explorerPath, findClosestVillage, revealExplorerPath } from './bonus';
import {
  BOTTLE_HEAL, BOTTLE_MONEY, bottleCollectableFor, collectExpiredBottles, randomBottleEffectKind, touchBottle,
  trySpawnBottle
} from './bottles';
import { buildBridge, buildBridgeIgnoringSkill } from './bridges';
import {
  buildBuilding, buildBuildingIgnoringSkill, builderBuildable, type BuilderBuildKind, buildingIncomeByVillage,
  burnBuilding, burnRoad, canUsePort, destroyBuilding, repairBuilding
} from './buildings';
import { captureVillage, villageIncomeTotal } from './capture';
import { attackableTargets, missChanceFor, performAttack, performSiege } from './combat';
import { knownTribesFor } from './discovery';
import { GameEvent } from './events';
import { exploreUnitPath } from './explore';
import { applyFood, refreshStarving } from './food';
import { captureWinnerIndex, computeWinner, quickCaptureScore, quickCaptureTurnsCount } from './game-mode';
import { hexDistance, hexNeighbors } from './hex';
import { freezeCoast, thawIce } from './ice';
import type { GameMap, MapTile } from './map-gen';
import type { Player } from './players';
import { START_RESOURCES, villageUpgradeCost } from './resources';
import { buildRoad } from './roads';
import {
  awardScore, awardTempleScores, CAPTURE_SCORE, COMBO_SCORE, EMPTY_STATS, KILL_SCORE, PIRATE_KILL_SCORE, PlayerStats,
  SKILL_SCORE, UPGRADE_SCORE
} from './score';
import { SEASON_LENGTH, seasonForTurn, SEASONS } from './season';
import { moveUnit, pathBetween, reachableTargets, tileAt } from './selection';
import { gainShipAbility, revertShip, upgradeShip } from './ship';
import { hasSkill, openSkill as applySkill, randomUnopenedSkill } from './skills';
import { spawnUnit } from './spawn';
import { adjacentEnemyVillages } from './stalker';
import type { GameStateSnapshot } from './state';
import { addStock, migrateLegacyResources, payAt } from './stock';
import { stormDamage, stormEligible, stormTargetShips } from './storm';
import { isWaterType, TileType } from './tile-types';
import { canPlaceTrapOn, TRAP_COST, trapAlive, trapDamage } from './traps';
import { canAttack, canDisband, canHeal, canMove, disbandCost, hasPirateDeal, healUnit, makeUnit, movePoints, PIRATE_DEAL_COST, PIRATE_OWNER, Unit, UNIT_MOVE_POINTS, UNIT_TYPES } from './units';
import { buildWall as applyWall, canBuildWall, upgradeVillage } from './village';
import { activeWeather, advanceWeather, createWeather, spawnWeather, WEATHER_RULES, type WeatherEvent } from './weather';
import { applyEarthquake, applyStormTurn } from './weather-effects';

export type Command =
  | { type: CommandType.MOVE; unitId: string; q: number; r: number }
  | { type: CommandType.ATTACK; unitId: string; q: number; r: number }
  | { type: CommandType.CAPTURE; q: number; r: number; unitId: string }
  | { type: CommandType.SPAWN; q: number; r: number; unitType: UnitType }
  | { type: CommandType.BUILD; q: number; r: number; kind: BuilderBuildKind; unitId?: string }
  | { type: CommandType.REPAIR; q: number; r: number }
  | { type: CommandType.DESTROY_BUILDING; q: number; r: number }
  | { type: CommandType.BURN; unitId: string }
  | { type: CommandType.BURN_ROAD; unitId: string }
  | { type: CommandType.BUILD_WALL; q: number; r: number }
  | { type: CommandType.BUILD_ROAD; q: number; r: number }
  | { type: CommandType.BUILD_BRIDGE; q: number; r: number }
  | { type: CommandType.UPGRADE_VILLAGE; q: number; r: number }
  | { type: CommandType.UPGRADE_SHIP; unitId: string }
  | { type: CommandType.OPEN_SKILL; skill: SkillId }
  | { type: CommandType.HEAL; unitId: string }
  | { type: CommandType.DISBAND; unitId: string }
  | { type: CommandType.DEAL; unitId: string }
  | { type: CommandType.SHIP_LANDING; unitId: string; q: number; r: number }
  | { type: CommandType.CLAIM_BONUS }
  | { type: CommandType.GET_BOTTLE }
  | { type: CommandType.ENABLE_STEALTH; unitId: string }
  | { type: CommandType.TRAP; unitId: string; q: number; r: number }
  | { type: CommandType.STORM; unitId: string }
  | { type: CommandType.STUN; unitId: string; q: number; r: number }
  | { type: CommandType.END_TURN }
  | { type: CommandType.GIVE_TO_AI; playerIndex: number }
  | { type: CommandType.FORFEIT; playerIndex: number };

/** Commands whose outcome on the authoritative sim is fully deterministic and
 *  therefore safe for a client to predict locally and replay later. */
export const PREDICTABLE_COMMAND_TYPES: ReadonlySet<Command['type']> = new Set<Command['type']>([
  CommandType.MOVE,
  CommandType.CAPTURE,
  CommandType.SPAWN,
  CommandType.BUILD,
  CommandType.REPAIR,
  CommandType.DESTROY_BUILDING,
  CommandType.BURN,
  CommandType.BURN_ROAD,
  CommandType.BUILD_WALL,
  CommandType.BUILD_ROAD,
  CommandType.BUILD_BRIDGE,
  CommandType.UPGRADE_VILLAGE,
  CommandType.UPGRADE_SHIP,
  CommandType.OPEN_SKILL,
  CommandType.HEAL,
  CommandType.DISBAND,
  CommandType.DEAL,
  CommandType.SHIP_LANDING,
  CommandType.ENABLE_STEALTH,
  CommandType.TRAP,
  CommandType.STORM,
]);

/** Attacks a pirate makes on one tribe before it turns to another. */
const PIRATE_ATTACKS_PER_TRIBE = 3;
/** How many of its latest target tribes a pirate remembers (never re-picked). */
const PIRATE_TRIBE_MEMORY = 2;

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
    this.expectedTurns = quickCaptureTurnsCount(players.length);
    this.bonusAwarded = false;
    this.map.season = seasonForTurn(this.turn);
    migrateLegacyResources(map, players);
    this.ensureAchievementBaseline();
  }

  static fromSnapshot(snap: GameStateSnapshot): Simulator {
    // Saves from before per-village stock keep wood/stone/ore/food on the
    // player (very old ones have no food at all: start them full); the
    // constructor moves them into the capital.
    for (const p of snap.players) {
      if (typeof p.resources.wood === 'number' && typeof p.resources.food !== 'number') p.resources.food = START_RESOURCES.food;
    }
    const sim = new Simulator(snap.map, snap.players, snap.mode);
    sim.turn = snap.turn;
    sim.map.season = seasonForTurn(sim.turn);
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
    this.emit({ type: GameEventType.TURN_STARTED, playerIndex: 0, turn: this.turn });
  }

  /** Farms + granaries and units on the map: changes whenever food supply or
   *  demand does (built, destroyed, spawned, disbanded or killed), plus village
   *  owners (a capture moves farms, granaries and upkeep between players) and
   *  roads/ports (they join or split food networks). */
  private foodSignature(): string {
    let buildings = 0;
    let units = 0;
    let owners = '';
    let roads = 0;
    for (const t of this.map.tiles) {
      if (t.settlement) owners += `${t.settlement.owner ?? '-'}`;
      if (t.roadOwner !== null && t.roadOwner !== undefined) roads++;
      if (t.building?.kind === BuildingKind.PORT) roads++;
      if (t.building?.kind === BuildingKind.FARM || t.building?.kind === BuildingKind.GRANARY) buildings++;
      if (t.unit) units++;
    }
    return `${buildings},${units},${owners},${roads}`;
  }

  applyCommand(cmd: Command): boolean {
    let ok = false;
    const foodBefore = this.foodSignature();
    switch (cmd.type) {
      case CommandType.MOVE:
        ok = this.doMove(cmd.unitId, cmd.q, cmd.r);
        break;
      case CommandType.ATTACK:
        ok = this.doAttack(cmd.unitId, cmd.q, cmd.r);
        break;
      case CommandType.CAPTURE:
        ok = this.doCapture(cmd.q, cmd.r, cmd.unitId);
        break;
      case CommandType.SPAWN:
        ok = this.doSpawn(cmd.q, cmd.r, cmd.unitType);
        break;
      case CommandType.BUILD:
        ok = cmd.unitId !== undefined
          ? this.doBuildWithUnit(cmd.unitId, cmd.q, cmd.r, cmd.kind)
          : this.doBuild(cmd.q, cmd.r, cmd.kind as BuildingKind);
        break;
      case CommandType.REPAIR:
        ok = this.doRepair(cmd.q, cmd.r);
        break;
      case CommandType.DESTROY_BUILDING:
        ok = this.doDestroyBuilding(cmd.q, cmd.r);
        break;
      case CommandType.BURN:
        ok = this.doBurn(cmd.unitId);
        break;
      case CommandType.BURN_ROAD:
        ok = this.doBurnRoad(cmd.unitId);
        break;
      case CommandType.BUILD_WALL:
        ok = this.doBuildWall(cmd.q, cmd.r);
        break;
      case CommandType.BUILD_ROAD:
        ok = this.doBuildRoad(cmd.q, cmd.r);
        break;
      case CommandType.BUILD_BRIDGE:
        ok = this.doBuildBridge(cmd.q, cmd.r);
        break;
      case CommandType.UPGRADE_VILLAGE:
        ok = this.doUpgradeVillage(cmd.q, cmd.r);
        break;
      case CommandType.UPGRADE_SHIP:
        ok = this.doUpgradeShip(cmd.unitId);
        break;
      case CommandType.OPEN_SKILL:
        ok = this.doOpenSkill(cmd.skill);
        break;
      case CommandType.HEAL:
        ok = this.doHeal(cmd.unitId);
        break;
      case CommandType.DISBAND:
        ok = this.doDisband(cmd.unitId);
        break;
      case CommandType.DEAL:
        ok = this.doDeal(cmd.unitId);
        break;
      case CommandType.SHIP_LANDING:
        ok = this.doShipLanding(cmd.unitId, cmd.q, cmd.r);
        break;
      case CommandType.CLAIM_BONUS:
        ok = this.doClaimBonus();
        break;
      case CommandType.GET_BOTTLE:
        ok = this.doGetBottle();
        break;
      case CommandType.ENABLE_STEALTH:
        ok = this.doEnableStealth(cmd.unitId);
        break;
      case CommandType.TRAP:
        ok = this.doBuildTrap(cmd.unitId, cmd.q, cmd.r);
        break;
      case CommandType.STORM:
        ok = this.doStorm(cmd.unitId);
        break;
      case CommandType.STUN:
        ok = this.doStun(cmd.unitId, cmd.q, cmd.r);
        break;
      case CommandType.END_TURN:
        this.doEndTurn();
        ok = true;
        break;
      case CommandType.GIVE_TO_AI:
        ok = this.doGiveToAI(cmd.playerIndex);
        break;
      case CommandType.FORFEIT:
        ok = this.doForfeit(cmd.playerIndex);
        break;
    }
    // A farm or granary, or a unit (a mouth to feed), appeared or disappeared:
    // re-evaluate starving villages.
    const foodChanged = this.foodSignature() !== foodBefore;
    if (ok && cmd.type !== CommandType.END_TURN && foodChanged) {
      for (const player of this.players) if (player.isActive) refreshStarving(this.map, player);
    }
    this.syncDiscoveries();
    if (ok && !this.gameOver) this.evaluateAchievementsForAll();
    return ok;
  }

  /** `applyCommand` as a generator for the one command that can run for a long
   *  time: ending the turn plays every AI seat's turn, so this pauses after each
   *  AI planning step and the caller can yield to the browser in between (see
   *  `runSliced`). Every other command completes in a single step. Returns the
   *  same boolean as `applyCommand`, and leaves the sim in the same state. */
  *applyCommandSteps(cmd: Command): Generator<void, boolean, void> {
    if (cmd.type !== CommandType.END_TURN) return this.applyCommand(cmd);
    yield* this.endTurnSteps(true);
    this.syncDiscoveries();
    if (!this.gameOver) this.evaluateAchievementsForAll();
    return true;
  }

  private evaluateAchievementsForAll(): void {
    this.ensureAchievementBaseline();
    for (const p of this.players) {
      const skip = this.achievementBaseline.get(p.index) ?? new Set<AchievementId>();
      for (const id of evaluateAchievements(this.map, p, skip)) {
        this.emit({ type: GameEventType.ACHIEVEMENT_UNLOCKED, playerIndex: p.index, achievement: id });
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
    this.emit({ type: GameEventType.SCORE_FLY, playerIndex, amount, q: tile.q, r: tile.r });
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
        this.emit({ type: GameEventType.HEALED, unitId: u.id, playerIndex });
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
    const canClimb = hasSkill(player, SkillId.CLIMBING);
    const canDock = hasSkill(player, SkillId.NAVIGATION);
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (unit.shipLevel !== undefined && target.terrain !== TileType.Water) return false;
    const reachable = reachableTargets(this.map, unit, movePoints(unit), canClimb, canDock, unit.owner);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    // A stalker's first move after spawning enables stealth before the walk
    // starts, so no one but its owner ever sees it move. The owner still sees
    // its own stalker moving normally.
    if (unit.type === UnitType.STALKER && !unit.isStealthed && !unit.firstMoveStealthDone && unit.shipLevel === undefined) {
      unit.isStealthed = true;
      unit.firstMoveStealthDone = true;
    }
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, {
      q,
      r
    }, canClimb, unit.shipLevel !== undefined, canDock, unit.owner, movePoints(unit));
    const shipLevel = unit.shipLevel;
    const fromTile = tileAt(this.map, from.q, from.r);
    // Walk the path one step at a time: an enemy that steps onto an invisible
    // stalker's cell (pathing does not see them) stops one cell short and
    // reveals it; a trap (Task 9) stops the mover on its own cell.
    let steps = [...path];
    let resolveTarget = target;
    let emitPath = path;
    let bump: Unit | null = null;
    let bumpedCell: { q: number; r: number } | null = null;
    let trap: MapTile | null = null;
    for (let i = 0; i < steps.length; i++) {
      const st = tileAt(this.map, steps[i]!.q, steps[i]!.r)!;
      const occ = st.unit;
      if (occ && occ.owner !== unit.owner && occ.isStealthed === true && occ.shipLevel === undefined && unit.shipLevel === undefined) {
        bump = occ;
        if (i === 0) {
          // The stalker sits on the very first cell of the path: the move does
          // not happen at all and the mover keeps its move action.
          this.revealStalker(bump);
          return true;
        }
        bumpedCell = steps[i - 1]!;
        resolveTarget = tileAt(this.map, bumpedCell.q, bumpedCell.r)!;
        emitPath = steps.slice(0, i);
        break;
      }
      if (st.trap && st.trap.owner !== unit.owner) {
        // A thorn trap stops the mover on its own cell: it takes the trap's
        // damage and the trap disappears.
        trap = st;
        resolveTarget = st;
        emitPath = steps.slice(0, i + 1);
        break;
      }
    }
    moveUnit(this.map, unit, resolveTarget);
    exploreUnitPath(this.map, emitPath, unit, unit.owner);
    this.clearAbandonedReady(fromTile, unit.owner);
    this.touchBonus(resolveTarget, unit);
    touchBottle(resolveTarget, this.turn);
    const docked = !bump && !trap && canUsePort(resolveTarget, player) && unit.shipLevel === undefined;
    if (docked) {
      gainShipAbility(unit);
      unit.hasAttacked = true;
    }
    this.emit({
      type: GameEventType.UNIT_MOVED,
      unitId,
      from,
      path: emitPath,
      to: { q: resolveTarget.q, r: resolveTarget.r },
      shipLevel
    });
    if (trap) this.triggerTrap(unit, trap);
    if (bump) this.revealStalker(bump);
    this.revealSpottedByVillage(unit);
    return true;
  }

  /** A stealthed stalker that ends its move beside an enemy village is spotted:
   *  its stealth drops and every player sees the notification. */
  private revealSpottedByVillage(unit: Unit): void {
    if (unit.isStealthed !== true) return;
    const village = adjacentEnemyVillages(this.map, unit, unit.owner)[0];
    if (!village) return;
    this.revealStalker(unit);
    this.emit({ type: GameEventType.STALKER_SPOTTED, unitId: unit.id, villageQ: village.q, villageR: village.r });
  }

  /** A village that just changed hands may suddenly be an enemy of a stealthed
   *  stalker parked next to it (e.g. it was a free village before): reveal it,
   *  keeping the invariant that stealth never survives beside an enemy. */
  private revealStalkersNearVillage(village: MapTile, newOwner: number): void {
    for (const n of hexNeighbors(village)) {
      const t = tileAt(this.map, n.q, n.r);
      const u = t?.unit;
      if (!u || u.isStealthed !== true || u.owner === newOwner) continue;
      this.revealStalker(u);
      this.emit({ type: GameEventType.STALKER_SPOTTED, unitId: u.id, villageQ: village.q, villageR: village.r });
    }
  }

  /** An enemy stepping onto a thorn trap stops there, takes ~45 damage (no
   *  miss, no counter-attack) and consumes the trap. */
  private triggerTrap(victim: Unit, trapTile: MapTile): void {
    const damage = trapDamage();
    victim.hp = Math.max(0, victim.hp - damage);
    trapTile.trap = null;
    this.emit({
      type: GameEventType.TRAP_TRIGGERED,
      q: trapTile.q,
      r: trapTile.r,
      targetId: victim.id,
      damage,
      attackerIndex: this.currentPlayerIndex
    });
    if (victim.hp <= 0) {
      const t = tileAt(this.map, victim.q, victim.r);
      if (t && t.unit === victim) t.unit = null;
    }
  }

  /** Traps placed more than TRAP_TURNS rounds ago are swept away. */
  private sweepTraps(): void {
    for (const t of this.map.tiles) {
      if (t.trap && !trapAlive(t.trap.placedTurn, this.turn)) t.trap = null;
    }
  }

  /** A stalker revealed by an enemy colliding with it or by attacking. */
  private revealStalker(unit: Unit): void {
    if (!unit.isStealthed) return;
    unit.isStealthed = false;
    this.emit({ type: GameEventType.STEALTH_REVEALED, unitId: unit.id, q: unit.q, r: unit.r });
  }

  private doEnableStealth(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (unit.type !== UnitType.STALKER) return false;
    if (unit.shipLevel !== undefined) return false;
    if (unit.isStealthed) return false;
    if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
    if ((unit.stunTurns ?? 0) >= 1) return false;
    if (adjacentEnemyVillages(this.map, unit, unit.owner).length > 0) return false;
    unit.isStealthed = true;
    unit.firstMoveStealthDone = true;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    unit.hasHealed = true;
    this.emit({ type: GameEventType.STEALTH_ENABLED, unitId });
    return true;
  }

  /** Trapper builds a thorn trap on its own or an adjacent non-water cell. */
  private doBuildTrap(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (unit.type !== UnitType.TRAPPER) return false;
    if (unit.shipLevel !== undefined) return false;
    if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
    if ((unit.stunTurns ?? 0) >= 1) return false;
    const player = this.players[unit.owner]!;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (!canPlaceTrapOn(target, tile)) return false;
    if (!payAt(this.map, player, tile, TRAP_COST)) return false;
    target.trap = { owner: unit.owner, placedTurn: this.turn };
    this.consumeUnitTurn(unit);
    this.emit({ type: GameEventType.TRAP_PLACED, q, r, playerIndex: player.index });
    return true;
  }

  /** Stormcaller storms its village's water tiles: every enemy or pirate ship
   *  on them takes ~90 damage (no miss, no counter). Consumes the whole turn. */
  private doStorm(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (unit.type !== UnitType.STORMCALLER) return false;
    if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
    if ((unit.stunTurns ?? 0) >= 1) return false;
    if (!stormEligible(this.map, unit)) return false;
    const damage = stormDamage();
    const targets = stormTargetShips(this.map, unit);
    const report: { q: number; r: number; damage: number }[] = [];
    const killer = this.players[unit.owner]!;
    for (const t of targets) {
      const ship = t.unit!;
      ship.hp = Math.max(0, ship.hp - damage);
      report.push({ q: t.q, r: t.r, damage });
      if (ship.hp <= 0) {
        killer.kills += 1;
        const pts = ship.owner < 0 ? PIRATE_KILL_SCORE : KILL_SCORE;
        awardScore(killer, pts);
        this.emitScoreFly(killer.index, pts, t);
        const victim = ship.owner >= 0 ? this.players[ship.owner] : null;
        if (victim) this.statsOf(victim).killedUnits += 1;
        this.statsOf(killer).enemyShipsKilled += 1;
        t.unit = null;
      }
    }
    this.consumeUnitTurn(unit);
    this.emit({ type: GameEventType.STORM, unitId, q: unit.q, r: unit.r, targets: report });
    return true;
  }

  /** Stunner's ranged stun: no damage, no counter-attack; the target cannot
   *  act this turn (if it has not acted yet) or next turn (if it already has). */
  private doStun(unitId: string, q: number, r: number): boolean {
    const attacker = this.findUnit(unitId);
    if (!attacker || attacker.owner !== this.currentPlayerIndex) return false;
    if (attacker.type !== UnitType.STUNNER) return false;
    if (!canAttack(attacker)) return false;
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (!target.unit || target.unit.owner === attacker.owner) return false;
    const dist = hexDistance(attacker, target);
    if (dist < 1 || dist > 2) return false;
    const player = this.players[attacker.owner]!;
    const attackerTile = { q: attacker.q, r: attacker.r };
    const targetTile = { q: target.q, r: target.r };
    const targetUnit = target.unit;
    if (this.rng() < missChanceFor(player)) {
      attacker.hasAttacked = true;
      this.emit({
        type: GameEventType.STUN_SHOT,
        attackerId: unitId,
        targetId: targetUnit.id,
        attackerTile,
        targetTile,
        missed: true,
        stunned: false
      });
      return true;
    }
    const alreadyActed = targetUnit.hasMoved || targetUnit.hasAttacked || targetUnit.hasHealed;
    // Not yet acted => blocked this round (=2, decremented to 1 at that turn's
    // start -> stunned through it). Already acted => blocked next round.
    targetUnit.stunTurns = 2;
    const stunned = (targetUnit.stunTurns ?? 0) >= 1;
    attacker.hasAttacked = true;
    this.emit({
      type: GameEventType.STUN_SHOT,
      attackerId: unitId,
      targetId: targetUnit.id,
      attackerTile,
      targetTile,
      missed: false,
      stunned
    });
    return true;
  }

  /** A stunned unit's counter ticks down once per round, at its owner's turn
   *  start: stunTurns 2 -> 1 -> 0, so it skips exactly its next acting turn. */
  private decrementStunsFor(playerIndex: number): void {
    for (const t of this.map.tiles) {
      const u = t.unit;
      if (u && u.owner === playerIndex && (u.stunTurns ?? 0) > 0) {
        u.stunTurns = (u.stunTurns ?? 0) - 1;
      }
    }
  }

  private doAttack(unitId: string, q: number, r: number): boolean {
    const attacker = this.findUnit(unitId);
    if (!attacker || attacker.owner !== this.currentPlayerIndex || !canAttack(attacker)) return false;
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (!attackableTargets(this.map, attacker, attacker.owner).some((t) => t.q === q && t.r === r)) return false;
    // Structure tiles (no standing unit) are siege targets: a catapult volley
    // removes a wall/building/bridge or downgrades a village instead of a
    // unit-vs-unit exchange.
    if (!target.unit) {
      const attackerPlayer = this.players[attacker.owner]!;
      const targetIndex =
        target.settlement ? target.settlement.owner ?? PIRATE_OWNER
          : target.bridge !== null && target.bridge !== undefined ? target.bridge.owner
            : target.roadOwner !== null && target.roadOwner !== undefined && target.roadOwner !== attacker.owner && !(target.building && target.ownedBy !== null && target.ownedBy !== attacker.owner) ? target.roadOwner
              : target.ownedBy !== null ? target.ownedBy ?? PIRATE_OWNER
                : PIRATE_OWNER;
      const outcome = performSiege(attacker, target, this.rng, missChanceFor(attackerPlayer));
      this.emit({
        type: GameEventType.SIEGE,
        attackerId: unitId,
        attackerIndex: attacker.owner,
        targetIndex: targetIndex ?? PIRATE_OWNER,
        targetTile: { q: target.q, r: target.r },
        missed: outcome.missed,
        destroyed: outcome.destroyed,
        ...(outcome.buildingHp !== undefined ? { buildingHp: outcome.buildingHp } : {}),
      });
      return true;
    }
    if (target.unit.owner === attacker.owner) return false;
    const attackerPlayer = this.players[attacker.owner]!;
    const targetPlayer = target.unit.owner >= 0 ? this.players[target.unit.owner] : null;
    const targetId = target.unit.id;
    const targetWasPirate = target.unit.type === UnitType.PIRATE;
    // Attacking a pirate you had a deal with breaks the deal: it is free to
    // hunt your tribe again (and may retaliate now or next turn).
    if (targetWasPirate && hasPirateDeal(target.unit, attacker.owner)) {
      const remaining = target.unit.paidBy!.filter((i) => i !== attacker.owner);
      if (remaining.length === 0) delete target.unit.paidBy;
      else target.unit.paidBy = remaining;
      this.emit({
        type: GameEventType.PIRATE_DEAL_CANCELED,
        unitId: target.unit.id,
        q: target.q,
        r: target.r,
        playerIndex: attacker.owner
      });
    }
    const attackerTilePos = { q: attacker.q, r: attacker.r };
    const targetTilePos = { q: target.q, r: target.r };
    const attackerPre = { type: attacker.type, owner: attacker.owner, shipLevel: attacker.shipLevel, hp: attacker.hp };
    const targetPre = {
      type: target.unit.type,
      owner: target.unit.owner,
      shipLevel: target.unit.shipLevel,
      hp: target.unit.hp
    };
    const result = performAttack(this.map, attacker, target, this.rng, missChanceFor(attackerPlayer));
    // Attacking always reveals a stealthed stalker (resolved with defense 0 in
    // resolveCombat, which reads isStealthed before this clears it).
    if (attacker.isStealthed) this.revealStalker(attacker);
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
      type: GameEventType.ATTACK,
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
    // A melee killer stepped onto the dead unit's tile: the same rule as moving
    // onto a trapped cell — it takes the trap's damage and the trap vanishes.
    if (
      result.targetDied &&
      !result.attackerDied &&
      target.unit === attacker &&
      target.trap &&
      target.trap.owner !== attacker.owner
    ) {
      this.triggerTrap(attacker, target);
    }
    // A land knight that kills may attack again in the same turn. Every 3 kills
    // in one turn triggers a Combo kill bonus of 30 points at the kill tile.
    if (attacker.type === UnitType.KNIGHT && attacker.shipLevel === undefined && attacker.hp > 0) {
      const killed = result.targetDied && !result.attackerDied;
      attacker.canExtraAttack = killed;
      if (killed) {
        attacker.killsThisTurn = (attacker.killsThisTurn ?? 0) + 1;
        if (attacker.killsThisTurn === 3) {
          awardScore(attackerPlayer, COMBO_SCORE);
          this.emitScoreFly(attackerPlayer.index, COMBO_SCORE, target);
          this.statsOf(attackerPlayer).knightCombos += 1;
          this.emit({ type: GameEventType.KNIGHT_COMBO, unitId, q: target.q, r: target.r, playerIndex: attacker.owner });
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
    this.revealStalkersNearVillage(village, unit.owner);
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
    this.emit({ type: GameEventType.CAPTURED, q, r, oldOwner, newOwner: unit.owner, ownerDied: result.ownerDied });
    return true;
  }

  private doSpawn(q: number, r: number, unitType: UnitType): boolean {
    const village = tileAt(this.map, q, r);
    if (!village || village.settlement?.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    if (spawnUnit(this.map, village, unitType, player)) {
      this.emit({ type: GameEventType.SPAWNED, unitType, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doBuild(q: number, r: number, kind: BuildingKind): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBuilding(this.map, tile, kind, player)) {
      if (tile.building?.kind === BuildingKind.TEMPLE || tile.building?.kind === BuildingKind.FOREST_TEMPLE) tile.building.bornTurn = this.turn;
      this.emit({ type: GameEventType.BUILT, kind, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  /** Builder special: the Villagers' builder raises sawmills/mines/ports/
   *  bridges on its own or an adjacent owned tile, no skill required, and
   *  consumes its whole turn. */
  private doBuildWithUnit(unitId: string, q: number, r: number, kind: BuilderBuildKind): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (unit.type !== UnitType.BUILDER) return false;
    if (unit.shipLevel !== undefined) return false;
    if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
    if ((unit.stunTurns ?? 0) >= 1) return false;
    const player = this.players[unit.owner]!;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (!builderBuildable(this.map, tile, kind, player).some((t) => t.q === q && t.r === r)) return false;
    if (kind === BuilderExtraKind.BRIDGE) {
      if (!buildBridgeIgnoringSkill(this.map, target, player)) return false;
      this.consumeUnitTurn(unit);
      this.emit({ type: GameEventType.BRIDGE_BUILT, q, r, playerIndex: player.index });
      return true;
    }
    if (!buildBuildingIgnoringSkill(this.map, target, kind, player)) return false;
    this.consumeUnitTurn(unit);
    this.emit({ type: GameEventType.BUILT, kind, q, r, playerIndex: player.index });
    return true;
  }

  private consumeUnitTurn(unit: Unit): void {
    unit.hasMoved = true;
    unit.hasAttacked = true;
    unit.hasHealed = true;
  }

  private doRepair(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (!repairBuilding(this.map, tile, player)) return false;
    this.emit({ type: GameEventType.BUILDING_REPAIRED, q, r, playerIndex: player.index });
    return true;
  }

  private doDestroyBuilding(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (!destroyBuilding(this.map, tile, player)) return false;
    this.emit({ type: GameEventType.BUILDING_DESTROYED, q, r, playerIndex: player.index });
    return true;
  }

  /** A unit standing on an enemy road destroys it, spending its whole turn. */
  private doBurnRoad(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r);
    if (!tile) return false;
    const owner = tile.roadOwner;
    if (owner === null || owner === undefined || !burnRoad(tile, unit)) return false;
    this.emit({ type: GameEventType.ROAD_BURNED, unitId, q: tile.q, r: tile.r, playerIndex: unit.owner, owner });
    return true;
  }

  /** A unit standing on an enemy farm or granary burns it, spending its whole turn. */
  private doBurn(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r);
    if (!tile) return false;
    const kind = tile.building?.kind;
    if (kind !== BuildingKind.FARM && kind !== BuildingKind.GRANARY) return false;
    if (!burnBuilding(tile, unit)) return false;
    this.emit({ type: GameEventType.BURNED, unitId, kind, q: tile.q, r: tile.r, playerIndex: unit.owner });
    return true;
  }

  private growTemples(): void {
    for (const t of this.map.tiles) {
      const b = t.building;
      if (!b || (b.kind !== BuildingKind.TEMPLE && b.kind !== BuildingKind.FOREST_TEMPLE) || b.level >= 4) continue;
      const born = b.bornTurn ?? this.turn;
      if (this.turn - born >= 2 && (this.turn - born) % 2 === 0) {
        b.level += 1;
        this.emit({ type: GameEventType.TEMPLE_GROWN, q: t.q, r: t.r, level: b.level, playerIndex: t.ownedBy ?? -1 });
      }
    }
  }

  private doBuildRoad(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildRoad(this.map, tile, player)) {
      this.emit({ type: GameEventType.ROAD_BUILT, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doBuildBridge(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBridge(this.map, tile, player)) {
      this.emit({ type: GameEventType.BRIDGE_BUILT, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doUpgradeVillage(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile?.settlement || tile.settlement.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    const cost = villageUpgradeCost(tile.settlement.level);
    if (!payAt(this.map, player, tile, cost)) return false;
    upgradeVillage(this.map, tile, this.rng);
    awardScore(player, UPGRADE_SCORE);
    this.statsOf(player).villageUpgrades += 1;
    this.emit({ type: GameEventType.VILLAGE_UPGRADED, q, r, level: tile.settlement.level, playerIndex: player.index });
    this.emitScoreFly(player.index, UPGRADE_SCORE, tile);
    return true;
  }

  private doBuildWall(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile?.settlement) return false;
    const player = this.currentPlayer;
    if (!canBuildWall(this.map, tile, player)) return false;
    if (!applyWall(this.map, tile, player)) return false;
    this.emit({ type: GameEventType.WALL_BUILT, q, r, playerIndex: player.index });
    return true;
  }

  private doUpgradeShip(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const player = this.currentPlayer;
    if (upgradeShip(this.map, unit, tile, player)) {
      exploreUnitPath(this.map, [{ q: unit.q, r: unit.r }], unit, unit.owner);
      this.emit({ type: GameEventType.SHIP_UPGRADED, unitId, level: unit.shipLevel!, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doOpenSkill(skill: SkillId): boolean {
    const player = this.currentPlayer;
    if (applySkill(player, skill)) {
      awardScore(player, SKILL_SCORE);
      this.statsOf(player).skillsOpened += 1;
      this.emit({ type: GameEventType.SKILL_OPENED, playerIndex: player.index, skill });
      this.emitScoreFly(player.index, SKILL_SCORE, tileAt(this.map, 0, 0)!);
      return true;
    }
    return false;
  }

  private doHeal(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex || !canHeal(unit)) return false;
    healUnit(unit);
    this.emit({ type: GameEventType.HEALED, unitId, playerIndex: unit.owner });
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
    if (player.resources.money < cost) return false;
    player.resources.money -= cost;
    const q = tile.q;
    const r = tile.r;
    // A disbanded unit no longer stands on the village, so any capture
    // readiness it had earned there is gone (fresh occupation restarts the
    // full-turn wait at the next turn start).
    this.clearAbandonedReady(tile, unit.owner);
    tile.unit = null;
    this.emit({ type: GameEventType.UNIT_DISBANDED, unitId, q, r, playerIndex: unit.owner });
    return true;
  }

  private doDeal(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.type !== UnitType.PIRATE) return false;
    const player = this.currentPlayer;
    if (hasPirateDeal(unit, player.index)) return false;
    if (player.resources.money < PIRATE_DEAL_COST) return false;
    player.resources.money -= PIRATE_DEAL_COST;
    (unit.paidBy ??= []).push(player.index);
    this.emit({ type: GameEventType.PIRATE_DEAL, unitId: unit.id, q: unit.q, r: unit.r, playerIndex: player.index });
    return true;
  }

  private doShipLanding(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.shipLevel === undefined || unit.owner !== this.currentPlayerIndex) return false;
    const target = tileAt(this.map, q, r);
    if (!target || target.terrain === TileType.Water) return false;
    const player = this.players[unit.owner]!;
    const canClimb = hasSkill(player, SkillId.CLIMBING);
    const canDock = hasSkill(player, SkillId.NAVIGATION);
    const reachable = reachableTargets(this.map, unit, movePoints(unit), canClimb, canDock, unit.owner);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, { q, r }, canClimb, true, canDock, unit.owner, movePoints(unit));
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
    this.emit({ type: GameEventType.UNIT_MOVED, unitId, from, path, to: { q, r }, shipLevel });
    this.emit({ type: GameEventType.SHIP_REVERTED, unitId });
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
  private doGetBottle(): boolean {
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
    this.emit({ type: GameEventType.AI_TAKEOVER, playerIndex });
    return true;
  }

  /** Host-only: forfeit a disconnected player — free their villages (ownerless),
   *  remove all their units and territories, and mark the tribe inactive so the
   *  end conditions can resolve. */
  private doForfeit(playerIndex: number): boolean {
    if (!this.eliminatePlayer(playerIndex)) return false;
    this.emit({ type: GameEventType.PLAYER_FORFEITED, playerIndex });
    if (!this.gameOver) this.checkEndConditions();
    return true;
  }

  /** Removes all villages, units, and territory of a player and marks them
   *  inactive, without ending the game. Used by forfeits and by the win cheat
   *  (which lets the local player's next End Turn resolve the victory). */
  eliminatePlayer(playerIndex: number): boolean {
    const player = this.players[playerIndex];
    if (!player || !player.isActive) return false;
    for (const t of this.map.tiles) {
      if (t.settlement && t.settlement.owner === playerIndex) {
        t.settlement.owner = null;
        t.settlement.captureReady = false;
      }
      if (t.unit && t.unit.owner === playerIndex) {
        // The unit stood on an enemy/free village: without it, any capture
        // readiness that turn belong to no one and must not leak to the next
        // unit that walks in.
        if (t.settlement && t.settlement.owner !== playerIndex) t.settlement.captureReady = false;
        t.unit = null;
      }
      if (t.bonus && t.bonus.claimer === playerIndex) t.bonus.claimer = null;
      if (t.ownedBy === playerIndex) {
        t.ownedBy = null;
        t.claimedByVillage = null;
      } else if (t.claimedByVillage && t.settlement?.owner === playerIndex) {
        // handled above; nothing extra
      }
    }
    player.isActive = false;
    return true;
  }

  private doEndTurn(): void {
    const steps = this.endTurnSteps(false);
    while (!steps.next().done);
  }

  /** The end-of-turn loop. With `sliced` it pauses between AI planning steps;
   *  without, it runs straight through (the synchronous `doEndTurn` path, which
   *  keeps calling `runAiTurn` so tools can wrap it). */
  private *endTurnSteps(sliced: boolean): Generator<void, void, void> {
    if (this.gameOver) return;
    this.autoHealFor(this.currentPlayerIndex);
    let guard = 0;
    for (; ;) {
      if (guard++ > 64) break;
      const next = (this.currentPlayerIndex + 1) % this.players.length;
      if (next === 0) {
        this.runPirateTurn();
        this.applyWeatherEffects();
        this.applyIncome();
        this.turn += 1;
        this.applySeasonChange();
        this.advanceWeatherEvents();
        this.runBottleTurn();
        this.growTemples();
        this.sweepTraps();
        this.resetUnitFlags();
        this.evaluateAchievementsForAll();
        if (sliced) yield;
        if (this.checkEndConditions()) return;
        const hasActiveHuman = this.players.some((p) => p.isActive && p.isHuman);
        if (!hasActiveHuman) return;
      }
      this.currentPlayerIndex = next;
      if (!this.players[next]!.isActive) continue;
      if (!this.players[next]!.isHuman) {
        if (sliced) yield* this.runAiTurnSteps(next);
        else this.runAiTurn(next);
        this.autoHealFor(next);
        if (sliced) yield;
        continue;
      }
      this.markCaptureReadyFor(next);
      this.decrementStunsFor(next);
      this.emit({ type: GameEventType.TURN_STARTED, playerIndex: next, turn: this.turn });
      return;
    }
  }

  /** Round-end damage of the storms active during the turn that is ending. */
  private applyWeatherEffects(): void {
    for (const storm of activeWeather(this.map)) {
      if (storm.type !== WeatherType.STORM) continue;
      const report = applyStormTurn(this.map, storm);
      if (report.units.length > 0 || report.buildings.length > 0) {
        this.emit({ type: GameEventType.WEATHER_DAMAGE, weather: { ...storm }, ...report });
      }
    }
  }

  /** Cheat: starts a `type` event right now, ignoring the schedule and the
   *  chance; with the maximum already active the oldest one is ended first.
   *  Returns false when the map has no valid place for it. */
  forceWeather(type: WeatherType): boolean {
    const active = activeWeather(this.map);
    if (active.length >= WEATHER_RULES.maxActive) {
      const [oldest] = active.splice(0, 1);
      this.emit({ type: GameEventType.WEATHER_ENDED, weather: { ...oldest! } });
    }
    const born = createWeather(this.map, type, this.turn, this.rng);
    if (!born) return false;
    this.announceWeather(born);
    return true;
  }

  private announceWeather(born: WeatherEvent): void {
    this.emit({ type: GameEventType.WEATHER_STARTED, weather: { ...born } });
    if (born.type !== WeatherType.EARTHQUAKE) return;
    const report = applyEarthquake(this.map, born, this.rng);
    if (report.units.length > 0 || report.buildings.length > 0) {
      this.emit({ type: GameEventType.WEATHER_DAMAGE, weather: { ...born }, ...report });
    }
  }

  /** Once the turn counter has advanced: events age and expire, storms drift,
   *  and the periodic spawn attempt may bring a new event (an earthquake strikes
   *  at once). */
  private advanceWeatherEvents(): void {
    const { ended, moved } = advanceWeather(this.map, this.rng);
    for (const weather of ended) this.emit({ type: GameEventType.WEATHER_ENDED, weather: { ...weather } });
    for (const weather of moved) this.emit({ type: GameEventType.WEATHER_MOVED, weather: { ...weather } });
    const born = spawnWeather(this.map, this.turn, this.rng);
    if (born) this.announceWeather(born);
  }

  /** On entering winter coast water freezes; on leaving it the ice melts. */
  private applySeasonChange(prev: Season = seasonForTurn(this.turn - 1)): void {
    const season = seasonForTurn(this.turn);
    this.map.season = season;
    if (season === prev) return;
    if (season === Season.WINTER) {
      const r = freezeCoast(this.map);
      this.emit({
        type: GameEventType.SEASON_CHANGED,
        season,
        frozen: r.frozen,
        thawed: [],
        landed: r.landed,
        removed: r.removed,
        killed: []
      });
    } else if (prev === Season.WINTER) {
      const r = thawIce(this.map);
      this.emit({
        type: GameEventType.SEASON_CHANGED,
        season,
        frozen: [],
        thawed: r.thawed,
        landed: [],
        removed: [],
        killed: r.killed
      });
    } else {
      this.emit({ type: GameEventType.SEASON_CHANGED, season, frozen: [], thawed: [], landed: [], removed: [], killed: [] });
    }
  }

  /** Cheat: jumps the turn counter forward to the first turn of the next
   *  `target` season and applies the change (freezing or thawing the coast).
   *  Returns false when `target` is already the current season. */
  forceSeason(target: Season): boolean {
    const prev = seasonForTurn(this.turn);
    if (prev === target) return false;
    const cycle = SEASONS.length * SEASON_LENGTH;
    const start = SEASONS.indexOf(target) * SEASON_LENGTH + 1;
    let turn = this.turn - ((this.turn - 1) % cycle) + start - 1;
    if (turn <= this.turn) turn += cycle;
    this.turn = turn;
    this.applySeasonChange(prev);
    return true;
  }

  private runAiTurn(playerIndex: number): void {
    const steps = this.runAiTurnSteps(playerIndex);
    while (!steps.next().done);
  }

  private *runAiTurnSteps(playerIndex: number): Generator<void, void, void> {
    const ai = this.players[playerIndex]!;
    logAiTurnStart(ai, this.turn);
    this.doClaimBonus();
    this.collectAiBottles(playerIndex);
    this.markCaptureReadyFor(playerIndex);
    this.decrementStunsFor(playerIndex);
    this.emit({ type: GameEventType.AI_TURN, playerIndex });
    const markers: AiActionMarker[] = [];
    let actionNo = 0;
    const exec = (a: AiAction, marker?: AiActionMarker): boolean => {
      actionNo += 1;
      const ok = this.execAiAction(a);
      if (aiLoggingEnabled()) {
        const m = marker ?? (actionNo - 1 < markers.length ? markers[actionNo - 1] : undefined);
        const tag = m ? `<${m.label}>${m.note}` : '<unknown>';
        console.log(`[AI]   exec ${ok ? 'OK  ' : 'FAIL'} #${actionNo} ${formatAiAction(a)} ${tag}`);
      }
      return ok;
    };
    if (ai.aiEngine !== AiEngine.BATCH) {
      yield* planAiActionsSteps(this.map, ai, this.aiRng(), this.mode, undefined, this.turn, exec);
    } else {
      const actions = planAiActions(this.map, ai, this.aiRng(), this.mode, markers, this.turn);
      for (const a of actions) exec(a);
    }
    this.evaluateAchievementsForAll();
  }

  private execAiAction(a: AiAction): boolean {
    let ok = false;
    switch (a.type) {
      case AiActionType.UPGRADE:
        ok = this.doUpgradeVillage(a.q, a.r);
        break;
      case AiActionType.MOVE:
        ok = this.doMove(a.unitId, a.q, a.r);
        break;
      case AiActionType.ATTACK:
        ok = this.doAttack(a.unitId, a.q, a.r);
        break;
      case AiActionType.SPAWN:
        ok = this.doSpawn(a.q, a.r, a.unitType);
        break;
      case AiActionType.CAPTURE:
        ok = this.doCapture(a.q, a.r, a.unitId);
        break;
      case AiActionType.HEAL:
        ok = this.doHeal(a.unitId);
        break;
      case AiActionType.BUILD:
        ok = this.doBuild(a.q, a.r, a.kind);
        break;
      case AiActionType.BUILD_ROAD:
        ok = this.doBuildRoad(a.q, a.r);
        break;
      case AiActionType.BUILD_BRIDGE:
        ok = this.doBuildBridge(a.q, a.r);
        break;
      case AiActionType.UPGRADE_SHIP:
        ok = this.doUpgradeShip(a.unitId);
        break;
      case AiActionType.OPEN_SKILL:
        ok = this.doOpenSkill(a.skill);
        break;
      case AiActionType.ENABLE_STEALTH:
        ok = this.doEnableStealth(a.unitId);
        break;
      case AiActionType.STORM:
        ok = this.doStorm(a.unitId);
        break;
      case AiActionType.TRAP:
        ok = this.doBuildTrap(a.unitId, a.q, a.r);
        break;
      case AiActionType.BURN:
        ok = this.doBurn(a.unitId);
        break;
      case AiActionType.BURN_ROAD:
        ok = this.doBurnRoad(a.unitId);
        break;
      case AiActionType.BUILDER_BUILD:
        ok = this.doBuildWithUnit(a.unitId, a.q, a.r, a.kind);
        break;
      case AiActionType.STUN:
        ok = this.doStun(a.unitId, a.q, a.r);
        break;
    }
    return ok;
  }

  private runPirateTurn(): void {
    if (this.disablePirates) return;
    this.trySpawnPirate();
    const pirates = this.map.tiles.filter((t) => t.unit && t.unit.type === UnitType.PIRATE).map((t) => t.unit!);
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
    for (const t of this.map.tiles) if (t.unit && t.unit.type === UnitType.PIRATE) used.add(t.unit.id);
    let n = 1;
    while (used.has(`pirate-${n}`)) n++;
    spot.unit = makeUnit(PIRATE_OWNER, UnitType.PIRATE, spot.q, spot.r, { id: `pirate-${n}` });
    this.emit({ type: GameEventType.PIRATE_SPAWNED, q: spot.q, r: spot.r });
  }

  /** Whether the pirate may hunt this tribe: it is alive, has a unit on the map
   *  and no pirate deal. */
  private pirateCanHunt(pirate: Unit, owner: number): boolean {
    const player = this.players[owner];
    if (!player || !player.isActive || hasPirateDeal(pirate, owner)) return false;
    return this.map.tiles.some((t) => t.unit && t.unit.owner === owner);
  }

  /** Picks the tribe a pirate hunts next: the nearest one that is not among its
   *  last two targets. When every candidate is on that list (two players, or
   *  few tribes left) it takes any other tribe. */
  private pickPirateTribe(pirate: Unit): number | undefined {
    const recent = pirate.pirateTribes ?? [];
    const eligible = this.players.map((p) => p.index).filter((i) => i !== pirate.pirateTarget && this.pirateCanHunt(pirate, i));
    const fresh = eligible.filter((i) => !recent.includes(i));
    const pool = fresh.length > 0 ? fresh : eligible;
    let best: number | undefined;
    let bestDist = Infinity;
    for (const i of pool) {
      const tile = this.nearestPlayerUnitTo(pirate, i);
      const d = tile ? hexDistance(pirate, tile) : Infinity;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best === undefined && pirate.pirateTarget !== undefined && this.pirateCanHunt(pirate, pirate.pirateTarget)) {
      return pirate.pirateTarget; // the only tribe left: keep hunting it
    }
    return best;
  }

  /** The tile of the unit a pirate goes for. A pirate hunts one tribe at a time
   *  and switches to another after PIRATE_ATTACKS_PER_TRIBE attacks (or when
   *  its tribe is gone). */
  private pirateTargetTile(pirate: Unit): MapTile | null {
    const spent = (pirate.pirateAttacks ?? 0) >= PIRATE_ATTACKS_PER_TRIBE;
    if (pirate.pirateTarget === undefined || spent || !this.pirateCanHunt(pirate, pirate.pirateTarget)) {
      const next = this.pickPirateTribe(pirate);
      if (next === undefined) return null;
      if (next !== pirate.pirateTarget) pirate.pirateTribes = [...(pirate.pirateTribes ?? []), next].slice(-PIRATE_TRIBE_MEMORY);
      pirate.pirateTarget = next;
      pirate.pirateAttacks = 0;
    }
    return this.nearestPlayerUnitTo(pirate, pirate.pirateTarget);
  }

  private pirateAct(unit: Unit): void {
    const target = this.pirateTargetTile(unit);
    if (!target) {
      this.pirateMoveRandom(unit);
      return;
    }
    const dist = hexDistance(unit, target);
    if (dist <= unit.attackDistance) {
      unit.pirateAttacks = (unit.pirateAttacks ?? 0) + 1;
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
      ship.type = UnitType.PIRATE;
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
    this.emit({ type: GameEventType.PIRATE_CAPTURE, q: targetTile.q, r: targetTile.r, playerIndex: targetOwner, success });
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
      for (let k = 0; k < Math.floor(UNIT_MOVE_POINTS.pirate / 10); k++) {
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
    this.emit({ type: GameEventType.UNIT_MOVED, unitId: unit.id, from, path: steps, to });
  }

  private nearestPlayerUnitTo(unit: Unit, owner?: number): MapTile | null {
    let best: MapTile | null = null;
    let bestDist = Infinity;
    for (const t of this.map.tiles) {
      if (!t.unit || t.unit.owner < 0) continue;
      if (owner !== undefined && t.unit.owner !== owner) continue;
      if (hasPirateDeal(unit, t.unit.owner)) continue;
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
    const targetPre = {
      type: targetUnit.type,
      owner: targetUnit.owner,
      shipLevel: targetUnit.shipLevel,
      hp: targetUnit.hp
    };
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
      type: GameEventType.ATTACK,
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
    const steps = path.slice(0, Math.floor(UNIT_MOVE_POINTS.pirate / 10));
    const from = { q: unit.q, r: unit.r };
    const to = steps[steps.length - 1]!;
    moveUnit(this.map, unit, tileAt(this.map, to.q, to.r)!);
    this.emit({ type: GameEventType.UNIT_MOVED, unitId: unit.id, from, path: steps, to });
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
      for (const [village, income] of buildingIncomeByVillage(this.map, player)) addStock(village, income);
    }
    this.applyFoodForAll();
  }

  /** Round-end food: farms feed, villages eat, starving villages hurt their units. */
  private applyFoodForAll(): void {
    for (const player of this.players) {
      if (!player.isActive) continue;
      for (const report of applyFood(this.map, player)) {
        this.emit({
          type: GameEventType.STARVATION,
          q: report.village.q,
          r: report.village.r,
          playerIndex: player.index,
          units: report.units,
        });
      }
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
    if (this.mode === GameMode.TURNS30 && this.turn >= 30) {
      awardTempleScores(this.map, this.players);
      awardAchievementScores(this.players);
      this.endGame(computeWinner(this.players, this.map));
      return true;
    }
    if (this.mode === GameMode.CAPTURE) {
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

  /** End the game immediately with the current-board winner (used when an
   *  eliminated player chooses "Finish" instead of watching). */
  endNow(): void {
    if (this.gameOver) return;
    awardTempleScores(this.map, this.players);
    awardAchievementScores(this.players);
    this.endGame(computeWinner(this.players, this.map));
  }

  private endGame(winnerIndex: number): void {
    const winner = this.players[winnerIndex]!;
    const bonus =
      this.mode === GameMode.CAPTURE && this.turn <= this.expectedTurns
        ? quickCaptureScore(this.players.length)
        : 0;
    if (bonus > 0) {
      awardScore(winner, bonus);
      this.bonusAwarded = true;
    }
    this.winnerIndex = winnerIndex;
    this.gameOver = true;
    this.emit({ type: GameEventType.GAME_OVER, winnerIndex, bonus });
  }
}
