/**
 * Multi-player AI audit: N AI players on one map, all Hard/balanced. The variant (ON=/OFF= flags, seat rotates every game)
 * plays against N-1 baseline players; reports its win share vs the fair share 1/N plus aggression telemetry.
 *
 *   N=4 [ON=a,b] [OFF=a] [DIFF=hard] npx vite-node tools/ai-multi.ts -- [games=40] [maxTurns=100]
 */
import { AiDifficulty, AiPersonalityId, GameEventType } from '@enums';
import { exploreVillageSights } from '../src/game/economy/village';
import { initialExplorationFor, isExploredFor } from '../src/game/map/explore';
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

const realLog = console.log.bind(console);
const args = process.argv.slice(2).filter((a) => a !== '--');
const GAMES = Number(args[0] ?? 40);
const MAX_TURNS = Number(args[1] ?? 100);
const N = Number(process.env.N ?? 4);
const SEED_BASE = Number(process.env.SEED_BASE ?? 7000);
const DIFF = (process.env.DIFF as AiDifficulty | undefined) ?? AiDifficulty.HARD;
const list = (v?: string): string[] => (v ?? '').split(',').filter(Boolean);

interface Stat { wins: number; shares: number; villages: number; captures: number; attacks: number; kills: number; sawEnemy: number; sawN: number; contact: number; contactN: number; elimTurn: number }
const blank = (): Stat => ({ wins: 0, shares: 0, villages: 0, captures: 0, attacks: 0, kills: 0, sawEnemy: 0, sawN: 0, contact: 0, contactN: 0, elimTurn: 0 });
const variant = blank();
const base = blank();
let eliminationGames = 0;
let turnsTotal = 0;
let explored40 = 0;
let explored40N = 0;

function play(seed: number): void {
  const vSeat = seed % N;
  const players = buildPlayers(TRIBES[0]!.id as Tribe, N - 1, new SeededRandom(seed), AiDifficulty.NORMAL);
  players.forEach((p, i) => {
    p.isHuman = false;
    p.difficulty = DIFF;
    p.personality = AiPersonalityId.BALANCED;
    p.aiEngine = 'live';
    p.aiFlags = i === vSeat ? { ...Object.fromEntries(list(process.env.ON).map((f) => [f, true])), ...Object.fromEntries(list(process.env.OFF).map((f) => [f, false])) } : {};
  });
  const map = generateMap(N, seed);
  for (const p of players) { initialExplorationFor(map, p.index); exploreVillageSights(map, p.index); }
  const rng = new SeededRandom(seed + 1);
  const sim = new Simulator(map, players, 'capture', { rng: rng.next.bind(rng), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
  sim.startGame();
  const run = sim as unknown as { runAiTurn(i: number): void };
  const per = Array.from({ length: N }, blank);
  const owners = new Map<string, number | null>();
  for (const t of map.tiles) if (t.settlement) owners.set(`${t.q},${t.r}`, t.settlement.owner);
  const sawAt = new Array<number>(N).fill(0);
  let guard = 0;
  while (!sim.gameOver && sim.turn < MAX_TURNS && guard++ < MAX_TURNS * 2) {
    sim.currentPlayerIndex = 0;
    if (players[0]!.isActive) run.runAiTurn(0);
    sim.applyCommand({ type: 'endTurn' });
    for (const e of sim.drainEvents()) {
      if (e.type === GameEventType.ATTACK && per[e.attackerIndex]) { per[e.attackerIndex]!.attacks++; if (e.targetDied) per[e.attackerIndex]!.kills++; }
    }
    const turn = sim.turn;
    for (const t of map.tiles) {
      if (!t.settlement) continue;
      const k = `${t.q},${t.r}`, was = owners.get(k) ?? null, now = t.settlement.owner;
      if (was !== now && now !== null && was !== null) per[now]!.captures++;
      owners.set(k, now);
    }
    for (let i = 0; i < N; i++) if (sawAt[i] === 0 && map.tiles.some((t) => t.settlement?.owner !== null && t.settlement?.owner !== i && t.settlement && isExploredFor(t, i))) sawAt[i] = turn;
    if (turn === 40) for (let i = 0; i < N; i++) {
      const foes = map.tiles.filter((t) => t.settlement && t.settlement.owner !== null && t.settlement.owner !== i);
      if (foes.length) { explored40 += foes.filter((t) => isExploredFor(t, i)).length / foes.length; explored40N++; }
    }
  }
  turnsTotal += sim.turn;
  const vills = players.map((_, i) => map.tiles.filter((t) => t.settlement?.owner === i).length);
  const alive = players.filter((_, i) => vills[i]! > 0).length;
  if (sim.gameOver && sim.winnerIndex !== null) eliminationGames++;
  // Winner: last standing, else most villages, then score.
  let w = 0;
  for (let i = 1; i < N; i++) if (vills[i]! > vills[w]! || (vills[i] === vills[w] && players[i]!.score > players[w]!.score)) w = i;
  void alive;
  const add = (s: Stat, i: number): void => {
    s.wins += w === i ? 1 : 0; s.villages += vills[i]!; s.captures += per[i]!.captures; s.attacks += per[i]!.attacks; s.kills += per[i]!.kills;
    if (sawAt[i]) { s.sawEnemy += sawAt[i]!; s.sawN++; }
  };
  for (let i = 0; i < N; i++) add(i === vSeat ? variant : base, i);
}

const t0 = performance.now();
for (let g = 0; g < GAMES; g++) play(SEED_BASE + g);
const bases = GAMES * (N - 1);
const f = (v: number, d: number, p = 1): string => (v / d).toFixed(p);
realLog(`N=${N} ${DIFF} games=${GAMES} maxTurns=${MAX_TURNS} ON=${process.env.ON ?? '-'} OFF=${process.env.OFF ?? '-'}`);
realLog(`variant win share ${f(variant.wins * 100, GAMES, 0)}% (fair ${(100 / N).toFixed(0)}%, se ±${(100 * Math.sqrt(((1 / N) * (1 - 1 / N)) / GAMES)).toFixed(0)}) | elimination games ${eliminationGames}/${GAMES} | avg turns ${f(turnsTotal, GAMES, 0)}`);
realLog(`per player: villages variant ${f(variant.villages, GAMES)} base ${f(base.villages, bases)} | captures variant ${f(variant.captures, GAMES, 2)} base ${f(base.captures, bases, 2)} | attacks variant ${f(variant.attacks, GAMES)} base ${f(base.attacks, bases)} | kills variant ${f(variant.kills, GAMES)} base ${f(base.kills, bases)}`);
realLog(`first sight of an enemy village: T${f(base.sawEnemy, Math.max(1, base.sawN))} (${base.sawN}/${bases}) | foe villages explored at T40: ${(100 * explored40 / Math.max(1, explored40N)).toFixed(0)}% | ${Math.round((performance.now() - t0) / 1000)}s`);
