import { GameEventType, UnitType } from '@enums';
import { performAttack } from './units/combat';
import { type GameEvent } from './events';
import { hexDistance, hexNeighbors } from './map/hex';
import type { GameMap, MapTile } from './map/map-gen';
import type { Player } from './players';
import { awardScore, PIRATE_KILL_SCORE, type PlayerStats } from './score';
import { moveUnit } from './units/selection';
import { isWaterType } from './map/tile-types';
import { hasPirateDeal, makeUnit, PIRATE_OWNER, type Unit, UNIT_MOVE_POINTS } from './units/units';
import { pickRandom } from '../util/random';
import { tileAt } from './map/tile-index';
import type { SimContext } from './sim-context';


/** Attacks a pirate makes on one tribe before it turns to another. */
const PIRATE_ATTACKS_PER_TRIBE = 3;
/** How many of its latest target tribes a pirate remembers (never re-picked). */
const PIRATE_TRIBE_MEMORY = 2;
/** Pirate turns a pirate hunts the tribe that attacked it. */
const PIRATE_REVENGE_TURNS = 3;

/** A pirate that survives an attack from `attackerOwner` hunts that tribe for the next few turns. */
export function provokePirate(pirate: Unit, attackerOwner: number): void {
  pirate.pirateRevenge = { target: attackerOwner, turns: PIRATE_REVENGE_TURNS };
}

/** The neutral pirates: spawning, choosing a target tribe, hunting, capturing ships. */
export class Pirates {
  constructor(private readonly host: SimContext) {}

  private get map(): GameMap {
    return this.host.map;
  }

  private get players(): Player[] {
    return this.host.players;
  }

  private get turn(): number {
    return this.host.turn;
  }

  private get rng(): () => number {
    return this.host.rng;
  }

  private emit(e: GameEvent): void {
    this.host.emit(e);
  }

  private statsOf(player: Player): PlayerStats {
    return this.host.statsOf(player);
  }

  private emitScoreFly(playerIndex: number, amount: number, tile: MapTile): void {
    this.host.emitScoreFly(playerIndex, amount, tile);
  }

  /** Spawns a pirate now and then and lets every pirate act. */
  run(): void {
    this.trySpawnPirate();
    const pirates = this.map.tiles.filter((t) => t.unit && t.unit.type === UnitType.PIRATE).map((t) => t.unit!);
    const acted = new Set<string>();
    for (const u of pirates) {
      if (acted.has(u.id)) continue;
      acted.add(u.id);
      this.pirateAct(u);
    }
  }

  private trySpawnPirate(): void {
    if (this.turn <= 5 || this.turn % 2 !== 1) return;
    if (this.rng() >= 0.15) return;
    const edge = this.map.tiles.filter(
      (t) => hexDistance({ q: 0, r: 0 }, t) === this.map.radius && isWaterType(t.terrain) && !t.unit,
    );
    if (edge.length === 0) return;
    const spot = pickRandom(edge, this.rng)!;
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
    const revenge = pirate.pirateRevenge;
    if (revenge) {
      if (--revenge.turns <= 0) delete pirate.pirateRevenge;
      if (this.pirateCanHunt(pirate, revenge.target)) {
        if (pirate.pirateTarget !== revenge.target) {
          pirate.pirateTribes = [...(pirate.pirateTribes ?? []), revenge.target].slice(-PIRATE_TRIBE_MEMORY);
          pirate.pirateTarget = revenge.target;
        }
        pirate.pirateAttacks = 0;
      }
    }
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
}
