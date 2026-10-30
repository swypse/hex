/**
 * Headless AI-vs-AI benchmark. Every seat is an AI; seats alternate between the
 * two engines (rotating per game so seat bias cancels) and the report compares
 * them on wins, villages held, score, and "exposure" — the number of AI turns
 * that ended with an own village empty while an enemy unit stood within 3 hexes.
 *
 *   npx vite-node tools/ai-bench.ts -- [games=20] [players=4] [maxTurns=60] [difficulty=hard]
 */
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/map/explore';
import { exploreVillageSights } from '../src/game/economy/village';
import { hexDistance } from '../src/game/map/hex';
import { ALL_AI_FLAGS_OFF, ALL_AI_FLAGS_ON, type AiFlags } from '../src/game/ai/ai-flags';
import { AI_TUNING } from '../src/game/ai/ai-patterns';
import type { AiDifficulty } from '../src/game/ai/ai-difficulty';
import { runRaiderTurn } from './ai-raider';
import { aiStepTrace } from '../src/game/ai/ai';
import { reachableTargets } from '../src/game/units/selection';
import { AiActionType, UnitType } from '@enums';
import { canSpawnType } from '../src/game/units/spawn';
import { spawnWouldBeKilled } from '../src/game/ai/ai-pattern-helpers';
import { unitsInVillage, villageCapacity } from '../src/game/economy/village';

// RAIDER=1: one seat per game (seed % players) plays the scripted raider (tools/ai-raider.ts); it is not tallied,
// the other seats alternate A/B as usual, so a flag is measured against a hostile opponent.
const RAIDER = process.env.RAIDER === '1';

// Seats alternate between variant A (the chosen flags off) and B (all flags on),
// both on the live engine.  FLAGS=a,b limits the comparison to those flags: A has
// them off, B has them on, every other flag is on for both. Noise floor is about
// +-4 points of win share at 160 games; smaller effects cannot be resolved.
type Engine = 'A' | 'B';
const ENGINES: Engine[] = ['A', 'B'];
const TESTED = (process.env.FLAGS ?? '').split(',').filter(Boolean) as (keyof AiFlags)[];

const args = process.argv.slice(2).filter((a) => a !== '--');
const GAMES = Number(args[0] ?? 20);
const PLAYERS = Number(args[1] ?? 4);
const MAX_TURNS = Number(args[2] ?? 60);
if (process.env.HORIZON) AI_TUNING.garrisonHorizonTurns = Number(process.env.HORIZON);
if (process.env.GRADED_THREAT === '0') AI_TUNING.gradedThreat = false;
const DIFFICULTY = (args[3] ?? 'hard') as AiDifficulty;

interface Tally {
  seats: number;
  wins: number;
  villages: number;
  score: number;
  kills: number;
  exposure: number;
  eliminated: number;
  lost: number;
  freeCaps: number;
  enemyCaps: number;
  aiMs: number;
}
const realLog = console.log.bind(console);
const reasons: Record<string, number> = {};
// Exact exposure: an own village left empty that an enemy land unit can walk onto next turn, by what emptied it.
const reach: Record<string, number> = {};
let reachTurns = 0;
let trades = 0;
const tally: Record<Engine, Tally> = {
  A: { seats: 0, wins: 0, villages: 0, score: 0, kills: 0, exposure: 0, eliminated: 0, lost: 0, freeCaps: 0, enemyCaps: 0, aiMs: 0 },
  B: { seats: 0, wins: 0, villages: 0, score: 0, kills: 0, exposure: 0, eliminated: 0, lost: 0, freeCaps: 0, enemyCaps: 0, aiMs: 0 },
};

// Paired per-game differences (B minus A, mean over each variant's seats).
const paired: Record<'score' | 'villages' | 'lost', number[]> = { score: [], villages: [], lost: [] };
function pairedLine(name: string, xs: number[]): string {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const se = sd / Math.sqrt(n);
  return `${name} B-A = ${mean.toFixed(2)} +- ${se.toFixed(2)} (${Math.abs(mean / (se || 1)).toFixed(1)} sigma)`;
}

function playGame(seed: number): void {
  const players = buildPlayers(TRIBES[0]!.id as Tribe, PLAYERS - 1, new SeededRandom(seed), DIFFICULTY);
  const raiderSeat = RAIDER ? seed % PLAYERS : -1;
  // Engines alternate over the non-raider seats only (the raider must not always take the same variant's slot).
  let nth = 0;
  const engineOf: Engine[] = players.map((_, i) => (i === raiderSeat ? 'A' : ENGINES[(nth++ + seed) % ENGINES.length]!));
  for (const p of players) {
    p.isHuman = false;
    p.difficulty = DIFFICULTY;
    p.aiEngine = 'live';
    if (engineOf[p.index] === 'A') {
      const off = TESTED.length > 0 ? Object.fromEntries(TESTED.map((f) => [f, false])) : ALL_AI_FLAGS_OFF;
      p.aiFlags = { ...ALL_AI_FLAGS_ON, ...off };
    } else p.aiFlags = { ...ALL_AI_FLAGS_ON };  // B: every flag on, including ones off by default
  }
  const map = generateMap(players.length, seed);
  for (const p of players) {
    initialExplorationFor(map, p.index);
    exploreVillageSights(map, p.index);
  }
  const sim = new Simulator(map, players, 'capture', { rng: new SeededRandom(seed + 1).next.bind(new SeededRandom(seed + 1)), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
  const lostBy: number[] = [];
  const freeBy: number[] = [];
  const enemyBy: number[] = [];
  const exposure = new Array<number>(players.length).fill(0);
  const aiMs = new Array<number>(players.length).fill(0);
  const anySim = sim as unknown as { runAiTurn(i: number): void };
  const original = anySim.runAiTurn.bind(sim);
  anySim.runAiTurn = (i: number): void => {
    const leftBy = new Map<string, string>(); // village key -> pattern that moved its unit away
    let stepCount = 0;
    const spawnedAt: string[] = [];
    aiStepTrace.hook = (id, steps) => {
      stepCount++;
      for (const a of steps) if (a.type === AiActionType.SPAWN) spawnedAt.push(`${a.q},${a.r}`);
      for (const a of steps) {
        if (a.type !== AiActionType.MOVE) continue;
        const from = map.tiles.find((t) => t.unit?.id === a.unitId);
        if (from?.settlement?.owner === i) leftBy.set(`${from.q},${from.r}`, id);
      }
    };
    const t0 = performance.now();
    const held = new Map<string, string | null>();
    for (const v of map.tiles) {
      if (v.settlement?.owner === i) held.set(`${v.q},${v.r}`, v.unit && v.unit.owner === i ? v.unit.id : null);
    }
    if (i === raiderSeat) runRaiderTurn(sim, i);
    else original(i);
    aiMs[i]! += performance.now() - t0;
    aiStepTrace.hook = null;
    if (i !== raiderSeat) {
      reachTurns++;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== i || v.unit) continue;
        const canReach = map.tiles.some((t) => t.unit && t.unit.owner !== i && t.unit.owner >= 0 && t.unit.shipLevel === undefined && hexDistance(t, v) <= 8 && reachableTargets(map, t.unit, undefined, true, false, t.unit.owner).some((c) => c.q === v.q && c.r === v.r));
        if (!canReach) continue;
        const why = leftBy.get(`${v.q},${v.r}`) ?? (held.get(`${v.q},${v.r}`) === undefined ? 'captured-this-turn' : held.get(`${v.q},${v.r}`) ? 'garrison-died-or-disbanded' : players[i]!.resources.money >= 4 ? 'was-empty-had-money' : 'was-empty-broke');
        let detail = '';
        if (why.startsWith('was-empty')) {
          const types = Object.values(UnitType).filter((u) => canSpawnType(map, v, u, players[i]!));
          const safe = types.filter((u) => !spawnWouldBeKilled(map, v, i, u));
          detail = unitsInVillage(map, v) >= villageCapacity(v.settlement.level) ? ':full' : types.length === 0 ? ':cannot-spawn(unaffordable/skills)' : safe.length === 0 ? ':all-spawns-doomed' : ':SPAWNABLE-SAFE';
        }
        reach[why + detail] = (reach[why + detail] ?? 0) + 1;
        if (detail.includes('SPAWNABLE') && process.env.DEBUG_EMPTY) realLog(`turn ${sim.turn} P${i} village ${v.q},${v.r} L${v.settlement.level} money ${players[i]!.resources.money} steps ${stepCount} spawnedThisTurn=[${spawnedAt}] types=${Object.values(UnitType).filter((u) => canSpawnType(map, v, u, players[i]!) && !spawnWouldBeKilled(map, v, i, u))}`);
      }
    }
    for (const v of map.tiles) {
      if (!v.settlement || v.settlement.owner !== i || v.unit) continue;
      const threatened = map.tiles.some((t) => t.unit && t.unit.owner !== i && t.unit.owner >= 0 && hexDistance(t, v) <= 3);
      if (threatened) {
        exposure[i]! += 1;
        const was = held.get(`${v.q},${v.r}`);
        let why: string;
        if (was === undefined) why = 'captured-this-turn';
        else if (was) {
          const alive = map.tiles.some((t) => t.unit?.id === was);
          why = alive ? 'garrison-left' : 'garrison-died';
        } else why = players[i]!.resources.money >= 4 ? 'empty-had-money' : 'empty-broke';
        reasons[why] = (reasons[why] ?? 0) + 1;
      }
    }
  };
  sim.startGame();
  // With no human seat, endTurn returns at every round boundary, so the driver
  // plays seat 0 itself and lets endTurn run seats 1..n-1.
  let guard = 0;
  while (!sim.gameOver && sim.turn < MAX_TURNS && guard++ < MAX_TURNS * 2) {
    sim.currentPlayerIndex = 0;
    if (players[0]!.isActive) anySim.runAiTurn(0);
    sim.applyCommand({ type: 'endTurn' });
    for (const ev of sim.drainEvents()) {
      if (ev.type === 'tradeSettled') trades++;
      if (ev.type !== 'captured') continue;
      if (ev.oldOwner !== null && ev.oldOwner >= 0) {
        lostBy[ev.oldOwner] = (lostBy[ev.oldOwner] ?? 0) + 1;
        enemyBy[ev.newOwner] = (enemyBy[ev.newOwner] ?? 0) + 1;
      } else freeBy[ev.newOwner] = (freeBy[ev.newOwner] ?? 0) + 1;
    }
  }
  const per: Record<Engine, { score: number; villages: number; lost: number; seats: number }> = {
    A: { score: 0, villages: 0, lost: 0, seats: 0 },
    B: { score: 0, villages: 0, lost: 0, seats: 0 },
  };
  for (const p of players) {
    if (p.index === raiderSeat) continue;
    const g = per[engineOf[p.index]!];
    g.seats += 1;
    g.score += p.score;
    g.villages += map.tiles.filter((t) => t.settlement?.owner === p.index).length;
    g.lost += lostBy[p.index] ?? 0;
  }
  if (per.A.seats > 0 && per.B.seats > 0) {
    for (const k of ['score', 'villages', 'lost'] as const) paired[k].push(per.B[k] / per.B.seats - per.A[k] / per.A.seats);
  }
  for (const p of players) {
    if (p.index === raiderSeat) continue;
    const e = tally[engineOf[p.index]!];
    e.seats += 1;
    e.villages += map.tiles.filter((t) => t.settlement?.owner === p.index).length;
    e.score += p.score;
    e.kills += p.kills;
    e.exposure += exposure[p.index]!;
    e.lost += lostBy[p.index] ?? 0;
    e.freeCaps += freeBy[p.index] ?? 0;
    e.enemyCaps += enemyBy[p.index] ?? 0;
    e.aiMs += aiMs[p.index]!;
    if (!p.isActive) e.eliminated += 1;
  }
  if (sim.gameOver && sim.winnerIndex !== null) { if (sim.winnerIndex !== raiderSeat) tally[engineOf[sim.winnerIndex]!].wins += 1; }
  else {
    // Turn cap reached: the seat holding the most villages takes the game.
    const best = players.filter((p) => p.index !== raiderSeat).reduce((a, b) => {
      const va = map.tiles.filter((t) => t.settlement?.owner === a.index).length;
      const vb = map.tiles.filter((t) => t.settlement?.owner === b.index).length;
      return vb > va ? b : a;
    });
    tally[engineOf[best.index]!].wins += 1;
  }
}

const t0 = performance.now();
const SEED_BASE = Number(process.env.SEED_BASE ?? 1000);
for (let g = 0; g < GAMES; g++) playGame(SEED_BASE + g);
realLog(`games=${GAMES} players=${PLAYERS} maxTurns=${MAX_TURNS} difficulty=${DIFFICULTY} (${Math.round((performance.now() - t0) / 1000)}s)`);
for (const e of ENGINES) {
  const t = tally[e];
  const n = Math.max(1, t.seats);
  realLog(
    `${e.padEnd(6)} wins/seat=${(t.wins / n).toFixed(3)} (wins=${t.wins})  villages/seat=${(t.villages / n).toFixed(2)}  score/seat=${(t.score / n).toFixed(1)}  ` +
      `kills/seat=${(t.kills / n).toFixed(1)}  exposure/seat=${(t.exposure / n).toFixed(2)}  lost/seat=${(t.lost / n).toFixed(2)}  freeCaps/seat=${(t.freeCaps / n).toFixed(2)}  enemyCaps/seat=${(t.enemyCaps / n).toFixed(2)}  eliminated/seat=${(t.eliminated / n).toFixed(3)}  ai-ms/seat=${Math.round(t.aiMs / n)}`,
  );
}

realLog(pairedLine('score', paired.score) + '\n' + pairedLine('villages', paired.villages) + '\n' + pairedLine('lost', paired.lost));
realLog(`reachable-empty villages after ${reachTurns} AI turns:`, JSON.stringify(Object.fromEntries(Object.entries(reach).sort((a, b) => b[1] - a[1])), null, 1));
realLog('exposure reasons:', JSON.stringify(Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])), null, 1));
realLog('settled trades:', trades);
