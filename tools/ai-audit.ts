/**
 * AI audit: 1v1 head-to-head matches between AI configurations (difficulty or personality), seats swapped every game.
 *
 *   MODE=difficulty npx vite-node tools/ai-audit.ts -- [gamesPerPair=40] [maxTurns=80]
 *   MODE=personality npx vite-node tools/ai-audit.ts -- [gamesPerPair=40] [maxTurns=80]
 *
 * Winner: last player standing, else (turn cap) most villages, else higher score; otherwise a draw.
 */
import { AiDifficulty, AiPersonalityId, GameEventType } from '@enums';
import { exploreVillageSights } from '../src/game/economy/village';
import { initialExplorationFor, isExploredFor } from '../src/game/map/explore';
import { hexDistance } from '../src/game/map/hex';
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

interface Config { label: string; difficulty: AiDifficulty; personality: AiPersonalityId }
const realLog = console.log.bind(console);
const args = process.argv.slice(2).filter((a) => a !== '--');
const GAMES = Number(args[0] ?? 40);
const MAX_TURNS = Number(args[1] ?? 80);
import { AI_DIFFICULTY_PROFILES } from '../src/game/ai/config/difficulty';
if (process.env.HARD_BONUS !== undefined) AI_DIFFICULTY_PROFILES.hard.incomeBonus = Number(process.env.HARD_BONUS);
const SEED_BASE = Number(process.env.SEED_BASE ?? 5000);
const MODE = process.env.MODE ?? 'difficulty';

const ABD = (process.env.DIFF as AiDifficulty | undefined) ?? AiDifficulty.HARD;
const configs: Config[] = MODE === 'ab'
  ? [{ label: 'variantA', difficulty: ABD, personality: AiPersonalityId.BALANCED }, { label: 'baseline', difficulty: ABD, personality: AiPersonalityId.BALANCED }]
  : MODE === 'personality'
  ? Object.values(AiPersonalityId).map((p) => ({ label: p, difficulty: AiDifficulty.HARD, personality: p }))
  : [AiDifficulty.HARD, AiDifficulty.NORMAL, AiDifficulty.EASY].map((d) => ({ label: d, difficulty: d, personality: AiPersonalityId.BALANCED }));

interface Pace { loss: Loss; sawEnemy: number; contact: number; capture: number; captures: number }
const NEVER = 999;
/** Unit deaths by role: `defended` = died as the target of an enemy attack, `attacking` = died after its own attack (counter-damage); starved = starvation damage events. */
interface Loss { aDefended: number; aAttacking: number; bDefended: number; bAttacking: number; aStarved: number; aAttacks: number; bAttacks: number; aKilledByNeutral: number; starveByTurn: number[]; emptyTurns: number; emptyReachTurns: number; turnsSampled: number }
const newLoss = (): Loss => ({ aDefended: 0, aAttacking: 0, bDefended: 0, bAttacking: 0, aStarved: 0, aAttacks: 0, bAttacks: 0, aKilledByNeutral: 0, starveByTurn: new Array(10).fill(0), emptyTurns: 0, emptyReachTurns: 0, turnsSampled: 0 });
interface Result { loss: Loss; never: { sawEnemy: number; contact: number }; pace: Pace; winsA: number; winsB: number; draws: number; elim: number; villA: number; villB: number; scoreA: number; scoreB: number; turns: number }

function play(seed: number, a: Config, b: Config): { pace: Pace; winner: 'A' | 'B' | null; eliminated: boolean; villA: number; villB: number; scoreA: number; scoreB: number; turns: number } {
  const players = buildPlayers(TRIBES[0]!.id as Tribe, 1, new SeededRandom(seed), AiDifficulty.NORMAL);
  const seatOfA = seed % 2;
  players.forEach((p, i) => {
    const c = i === seatOfA ? a : b;
    p.isHuman = false;
    p.difficulty = c.difficulty;
    p.personality = c.personality;
    p.aiEngine = 'live';
    // Shipped defaults; ON=a,b / OFF=a,b flip single flags.
    const list = (v?: string): string[] => (v ?? '').split(',').filter(Boolean);
    // MODE=ab: seat A runs ON/OFF, seat B runs ON_B/OFF_B (same personality), so the variant plays against the baseline.
    const isA = i === seatOfA && MODE === 'ab';
    const on = isA || MODE !== 'ab' ? list(process.env.ON) : list(process.env.ON_B);
    const off = isA || MODE !== 'ab' ? list(process.env.OFF) : list(process.env.OFF_B);
    p.aiFlags = { ...Object.fromEntries(on.map((f) => [f, true])), ...Object.fromEntries(off.map((f) => [f, false])) };
  });
  const map = generateMap(2, seed);
  for (const p of players) { initialExplorationFor(map, p.index); exploreVillageSights(map, p.index); }
  const rng = new SeededRandom(seed + 1);
  const sim = new Simulator(map, players, 'capture', { rng: rng.next.bind(rng), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
  sim.startGame();
  const run = sim as unknown as { runAiTurn(i: number): void };
  let guard = 0;
  // Aggression telemetry for seat A: first turn it saw an enemy village, first unit contact, first capture of an enemy village, captures total.
  const pace: Pace = { loss: newLoss(), sawEnemy: NEVER, contact: NEVER, capture: NEVER, captures: 0 };
  const owners = new Map<string, number | null>();
  for (const t of map.tiles) if (t.settlement) owners.set(`${t.q},${t.r}`, t.settlement.owner);
  while (!sim.gameOver && sim.turn < MAX_TURNS && guard++ < MAX_TURNS * 2) {
    sim.currentPlayerIndex = 0;
    if (players[0]!.isActive) run.runAiTurn(0);
    sim.applyCommand({ type: 'endTurn' });
    for (const e of sim.drainEvents()) {
      if (e.type === GameEventType.ATTACK) {
        const bSeat = 1 - seatOfA;
        if (e.attackerIndex === seatOfA) pace.loss.aAttacks++; else if (e.attackerIndex === bSeat) pace.loss.bAttacks++;
        if (e.targetDied) {
          if (e.targetIndex === seatOfA) { if (e.attackerIndex === bSeat) pace.loss.aDefended++; else pace.loss.aKilledByNeutral++; }
          else if (e.targetIndex === bSeat && e.attackerIndex === seatOfA) pace.loss.bDefended++;
        }
        if (e.attackerDied) { if (e.attackerIndex === seatOfA) pace.loss.aAttacking++; else if (e.attackerIndex === bSeat) pace.loss.bAttacking++; }
      } else if (e.type === GameEventType.STARVATION && e.playerIndex === seatOfA) { pace.loss.aStarved += e.units.length; pace.loss.starveByTurn[Math.min(9, Math.floor(sim.turn / 10))]! += e.units.length; }
    }
    const turn = sim.turn;
    const units = map.tiles.filter((t) => t.unit);
    if (pace.sawEnemy === NEVER && map.tiles.some((t) => t.settlement && t.settlement.owner === 1 - seatOfA && isExploredFor(t, seatOfA))) pace.sawEnemy = turn;
    if (pace.contact === NEVER && units.some((a) => a.unit!.owner === seatOfA && units.some((b) => b.unit!.owner === 1 - seatOfA && hexDistance(a, b) <= 2))) pace.contact = turn;
    // Opportunity: enemy villages known to A with no unit on them, and whether an A unit stands within 8 hexes of one.
    const emptyB = map.tiles.filter((t) => t.settlement?.owner === 1 - seatOfA && !t.unit && isExploredFor(t, seatOfA));
    pace.loss.turnsSampled++;
    if (emptyB.length > 0) { pace.loss.emptyTurns++; if (emptyB.some((v) => units.some((u) => u.unit!.owner === seatOfA && hexDistance(u, v) <= 8))) pace.loss.emptyReachTurns++; }
    for (const t of map.tiles) {
      if (!t.settlement) continue;
      const k = `${t.q},${t.r}`, was = owners.get(k) ?? null, now = t.settlement.owner;
      if (was !== now && now === seatOfA && was === 1 - seatOfA) { pace.captures++; if (pace.capture === NEVER) pace.capture = turn; }
      owners.set(k, now);
    }
  }
  const vill = (i: number): number => map.tiles.filter((t) => t.settlement?.owner === i).length;
  const vA = vill(seatOfA), vB = vill(1 - seatOfA);
  const sA = players[seatOfA]!.score, sB = players[1 - seatOfA]!.score;
  let winner: 'A' | 'B' | null = null;
  const eliminated = sim.gameOver && sim.winnerIndex !== null;
  if (eliminated) winner = sim.winnerIndex === seatOfA ? 'A' : 'B';
  else if (vA !== vB) winner = vA > vB ? 'A' : 'B';
  else if (sA !== sB) winner = sA > sB ? 'A' : 'B';
  return { pace, winner, eliminated, villA: vA, villB: vB, scoreA: sA, scoreB: sB, turns: sim.turn };
}

const t0 = performance.now();
const matrix: string[] = [];
for (let i = 0; i < configs.length; i++) {
  for (let j = i + 1; j < configs.length; j++) {
    const r: Result = { loss: newLoss(), never: { sawEnemy: 0, contact: 0 }, pace: { sawEnemy: 0, contact: 0, capture: 0, captures: 0 }, winsA: 0, winsB: 0, draws: 0, elim: 0, villA: 0, villB: 0, scoreA: 0, scoreB: 0, turns: 0 };
    let never = 0;
    for (let g = 0; g < GAMES; g++) {
      const x = play(SEED_BASE + g, configs[i]!, configs[j]!);
      if (x.winner === 'A') r.winsA++; else if (x.winner === 'B') r.winsB++; else r.draws++;
      if (x.eliminated) r.elim++;
      if (x.pace.sawEnemy === NEVER) r.never.sawEnemy++; else r.pace.sawEnemy += x.pace.sawEnemy;
      if (x.pace.contact === NEVER) r.never.contact++; else r.pace.contact += x.pace.contact;
      if (x.pace.capture !== NEVER) r.pace.capture += x.pace.capture;
      r.pace.captures += x.pace.captures;
      for (const k of Object.keys(r.loss) as (keyof Loss)[]) { if (k === 'starveByTurn') x.pace.loss.starveByTurn.forEach((v, i) => (r.loss.starveByTurn[i]! += v)); else (r.loss[k] as number) += x.pace.loss[k] as number; }
      if (x.pace.capture === NEVER) never++;
      r.villA += x.villA; r.villB += x.villB; r.scoreA += x.scoreA; r.scoreB += x.scoreB; r.turns += x.turns;
    }
    const decided = r.winsA + r.winsB;
    const share = decided ? r.winsA / decided : 0.5;
    const se = Math.sqrt(0.25 / Math.max(1, decided));
    matrix.push(
      `${configs[i]!.label.padEnd(10)} vs ${configs[j]!.label.padEnd(10)} wins ${r.winsA}-${r.winsB} draws ${r.draws} (${(share * 100).toFixed(0)}% +-${(se * 100).toFixed(0)}) ` +
        `| elim ${r.elim}/${GAMES} | villages ${(r.villA / GAMES).toFixed(1)}-${(r.villB / GAMES).toFixed(1)} | score ${(r.scoreA / GAMES).toFixed(0)}-${(r.scoreB / GAMES).toFixed(0)} | avgTurns ${(r.turns / GAMES).toFixed(0)}`,
    );
    realLog(matrix[matrix.length - 1]);
    const L = r.loss, per = (v: number): string => (v / GAMES).toFixed(1);
    realLog(`   seat-A losses/game: killedByEnemy ${per(L.aDefended)} diedAfterOwnAttack ${per(L.aAttacking)} killedByNeutral ${per(L.aKilledByNeutral)} starvationHits ${per(L.aStarved)} attacks ${per(L.aAttacks)} | seat-B: killedByEnemy ${per(L.bDefended)} diedAfterOwnAttack ${per(L.bAttacking)} attacks ${per(L.bAttacks)}`);
    realLog(`   starvation hits/game by 10-turn bucket (T0-9,10-19,...): ${L.starveByTurn.map((v) => per(v)).join(' ')}`);
    realLog(`   empty-enemy-village known: ${(100 * L.emptyTurns / Math.max(1, L.turnsSampled)).toFixed(0)}% of turns | with an own unit within 8 hexes: ${(100 * L.emptyReachTurns / Math.max(1, L.turnsSampled)).toFixed(0)}%`);
    const mean = (v: number, hit: number): string => (hit > 0 ? (v / hit).toFixed(1) : '-');
    realLog(`   seat-A pace (mean turn over games where it happened): sawEnemy T${mean(r.pace.sawEnemy, GAMES - r.never.sawEnemy)} (${GAMES - r.never.sawEnemy}/${GAMES}) | contact T${mean(r.pace.contact, GAMES - r.never.contact)} (${GAMES - r.never.contact}/${GAMES}) | capture T${mean(r.pace.capture, GAMES - never)} (${GAMES - never}/${GAMES}) | captures/game ${(r.pace.captures / GAMES).toFixed(2)}`);
  }
}
realLog(`MODE=${MODE} games/pair=${GAMES} maxTurns=${MAX_TURNS} (${Math.round((performance.now() - t0) / 1000)}s)`);
