import { SeededRandom } from '@/util';
import { AchievementId, AiActionType, AiEngine, BuilderExtraKind, BuildingKind, CommandType, GameEventType, GameMode, Season, SkillId, UnitType, WeatherType } from '@enums';
import { awardAchievementScores, currentlyMetIds, evaluateAchievements } from './achievements';
import { type AiActionMarker, aiLoggingEnabled, formatAiAction, logAiTurnStart, planAiActions, planAiActionsSteps } from './ai/ai';
import type { AiAction } from './ai/ai-types';
import { touchBottle } from './map/bottles';
import { buildBridge, buildBridgeIgnoringSkill } from './economy/bridges';
import {
  buildBuilding, buildBuildingIgnoringSkill, builderBuildable, type BuilderBuildKind, buildingIncomeByVillage,
  burnBuilding, burnRoad, canUsePort, destroyBuilding, repairBuilding
} from './economy/buildings';
import { captureVillage, villageIncomeTotal } from './economy/capture';
import { attackableTargets, missChanceFor, performAttack, performSiege } from './units/combat';
import { knownTribesFor } from './discovery';
import { type GameEvent } from './events';
import { exploreUnitPath } from './map/explore';
import { applyFood, refreshStarving } from './economy/food';
import { trackNetworkEpoch, untrackedNetworks } from './economy/network-fingerprint';
import { captureWinnerIndex, computeWinner, quickCaptureScore, quickCaptureTurnsCount } from './game-mode';
import { hexDistance, hexNeighbors } from './map/hex';
import type { GameMap, MapTile } from './map/map-gen';
import type { Player } from './players';
import { START_RESOURCES, villageUpgradeCost } from './economy/resources';
import { buildRoad } from './economy/roads';
import {
  awardScore, awardTempleScores, CAPTURE_SCORE, COMBO_SCORE, EMPTY_STATS, KILL_SCORE, PIRATE_KILL_SCORE, type PlayerStats,
  SKILL_SCORE, UPGRADE_SCORE
} from './score';
import { SEASON_LENGTH, seasonForTurn, SEASONS } from './season';
import { moveUnit, pathBetween, reachableTargets } from './units/selection';
import { gainShipAbility, revertShip, upgradeShip } from './units/ship';
import { hasSkill, openSkill as applySkill } from './skills';
import { spawnUnit } from './units/spawn';
import { adjacentEnemyVillages } from './units/stalker';
import type { GameStateSnapshot } from './state';
import { addStock, migrateLegacyResources, payAt } from './economy/stock';
import { stormDamage, stormEligible, stormTargetShips } from './units/storm';
import { TileType } from './map/tile-types';
import { canPlaceTrapOn, TRAP_COST, trapAlive, trapDamage } from './units/traps';
import { canAttack, canDisband, canHeal, canMove, disbandCost, canDealWithPirate, hasPirateDeal, healUnit, movePoints, PIRATE_DEAL_COST, PIRATE_OWNER, type Unit } from './units/units';
import { buildWall as applyWall, canBuildWall, upgradeVillage } from './economy/village';
import { randomSeed } from '../util/random';
import { Bonuses } from './bonuses';
import { Environment } from './environment';
import { Pirates, provokePirate } from './pirates';
import type { SimContext } from './sim-context';
import { tileAt } from './map/tile-index';
import { extinguishCells } from './weather/fire';

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
  | { type: CommandType.EXTINGUISH; unitId: string; q: number; r: number }
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
  CommandType.EXTINGUISH,
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
  private readonly disablePirates: boolean;
  private readonly pirates: Pirates;
  private readonly bonuses: Bonuses;
  private readonly environment: Environment;
  private events: GameEvent[] = [];
  private achievementBaseline = new Map<number, Set<AchievementId>>();

  constructor(
    map: GameMap,
    players: Player[],
    mode: GameMode,
    opts: { rng?: () => number; aiRng?: () => SeededRandom; disablePirates?: boolean } = {},
  ) {
    const sim = this;
    this.map = map;
    this.players = players;
    this.mode = mode;
    this.rng = opts.rng ?? Math.random;
    this.aiRng = opts.aiRng ?? (() => new SeededRandom(randomSeed()));
    this.disablePirates = opts.disablePirates ?? false;
    const ctx: SimContext = {
      map,
      get players() { return sim.players; },
      get turn() { return sim.turn; },
      get currentPlayer() { return sim.currentPlayer; },
      rng: () => this.rng(),
      emit: (e) => this.emit(e),
      statsOf: (p) => this.statsOf(p),
      emitScoreFly: (i, n, tile) => this.emitScoreFly(i, n, tile),
    };
    this.pirates = new Pirates(ctx);
    this.bonuses = new Bonuses(ctx);
    this.environment = new Environment(ctx);
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
        ok = this.bonuses.doClaimBonus();
        break;
      case CommandType.GET_BOTTLE:
        ok = this.bonuses.doGetBottle();
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
      case CommandType.EXTINGUISH:
        ok = this.doExtinguish(cmd.unitId, cmd.q, cmd.r);
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
      const before = known.size;
      for (const tribe of visible) known.add(tribe);
      if (known.size !== before || p.knownTribes === undefined) p.knownTribes = [...known];
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
    this.bonuses.touchBonus(resolveTarget, unit);
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

  /** A unit puts out the fire on its own or an adjacent tile. Consumes the whole turn. */
  private doExtinguish(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
    if ((unit.stunTurns ?? 0) >= 1) return false;
    const target = extinguishCells(this.map, unit).find((t) => t.q === q && t.r === r);
    if (!target) return false;
    target.fire = null;
    this.consumeUnitTurn(unit);
    this.emit({ type: GameEventType.FIRE_EXTINGUISHED, unitId, q, r });
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
    const targetUnit = target.unit;
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
    // A surviving pirate hunts its attacker's tribe for the next few turns.
    if (targetWasPirate && !result.targetDied) provokePirate(targetUnit, attacker.owner);
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
    const tile = tileAt(this.map, unit.q, unit.r);
    if (!tile || !canDealWithPirate(tile, player.index)) return false;
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
    this.bonuses.touchBonus(target, unit);
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
    // Watching: a call ends on the last player after a round; the next one
    // starts a new round instead of repeating the round end.
    if (this.currentPlayerIndex === this.players.length - 1 && !this.players.some((p) => p.isActive && p.isHuman)) this.currentPlayerIndex = 0;
    let guard = 0;
    for (; ;) {
      if (guard++ > 64) break;
      const next = (this.currentPlayerIndex + 1) % this.players.length;
      if (next === 0) {
        if (!this.disablePirates) this.pirates.run();
        this.environment.applyWeatherEffects();
        this.applyIncome();
        this.turn += 1;
        this.environment.applySeasonChange();
        this.environment.advanceWeatherEvents();
        this.bonuses.runBottleTurn();
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

  /** Cheat: starts a `type` event right now, ignoring the schedule and the
   *  chance; with the maximum already active the oldest one is ended first.
   *  Returns false when the map has no valid place for it. */
  forceWeather(type: WeatherType): boolean {
    return this.environment.forceWeather(type);
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
    this.environment.applySeasonChange(prev);
    return true;
  }

  private runAiTurn(playerIndex: number): void {
    const steps = this.runAiTurnSteps(playerIndex);
    while (!steps.next().done);
  }

  private *runAiTurnSteps(playerIndex: number): Generator<void, void, void> {
    const ai = this.players[playerIndex]!;
    logAiTurnStart(ai, this.turn);
    this.bonuses.doClaimBonus();
    this.bonuses.collectAiBottles(playerIndex);
    this.markCaptureReadyFor(playerIndex);
    this.decrementStunsFor(playerIndex);
    this.emit({ type: GameEventType.AI_TURN, playerIndex });
    const markers: AiActionMarker[] = [];
    let actionNo = 0;
    const exec = (a: AiAction, marker?: AiActionMarker): boolean => {
      actionNo += 1;
      const ok = untrackedNetworks(() => this.execAiAction(a));
      if (aiLoggingEnabled()) {
        const m = marker ?? (actionNo - 1 < markers.length ? markers[actionNo - 1] : undefined);
        const tag = m ? `<${m.label}>${m.note}` : '<unknown>';
        console.log(`[AI]   exec ${ok ? 'OK  ' : 'FAIL'} #${actionNo} ${formatAiAction(a)} ${tag}`);
      }
      return ok;
    };
    if (ai.aiEngine !== AiEngine.BATCH) {
      // Planning only reads the map between actions: let the network memo skip
      // its per-query fingerprint pass (actions bump the epoch, see exec).
      trackNetworkEpoch(this.map);
      try {
        yield* planAiActionsSteps(this.map, ai, this.aiRng(), this.mode, undefined, this.turn, exec);
      } finally {
        trackNetworkEpoch(null);
      }
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
      case AiActionType.REPAIR:
        ok = this.doRepair(a.q, a.r);
        break;
      case AiActionType.EXTINGUISH:
        ok = this.doExtinguish(a.unitId, a.q, a.r);
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
