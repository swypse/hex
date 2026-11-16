/**
 * One all-AI game; per AI turn prints food networks (balance/pressure), roads/ports the food plan wants, and whether the Roads skill is known.
 *
 *   npx vite-node tools/ai-food-trace.ts -- [seed=1000] [turns=80] [every=10]
 */
import { SkillId } from '@enums';
import { exploreVillageSights } from '../src/game/economy/village';
import { foodNetworkStates } from '../src/game/economy/food';
import { planFoodFixes } from '../src/game/ai/economy/food/plan-food-fixes';
import { initialExplorationFor } from '../src/game/map/explore';
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { hasSkill } from '../src/game/skills';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

const args = process.argv.slice(2).filter((a) => a !== '--');
const seed = Number(args[0] ?? 1000);
const turns = Number(args[1] ?? 80);
const every = Number(args[2] ?? 10);
const players = buildPlayers(TRIBES[0]!.id as Tribe, 3, new SeededRandom(seed), 'hard');
for (const p of players) { p.isHuman = false; p.aiEngine = 'live'; }
const map = generateMap(players.length, seed);
for (const p of players) { initialExplorationFor(map, p.index); exploreVillageSights(map, p.index); }
const sim = new Simulator(map, players, 'capture', { rng: new SeededRandom(seed + 1).next.bind(new SeededRandom(seed + 1)), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
const anySim = sim as unknown as { runAiTurn(i: number): void };
const original = anySim.runAiTurn.bind(sim);
const log = console.log.bind(console);
anySim.runAiTurn = (i: number): void => {
  original(i);
  if (sim.turn % every !== 0) return;
  const p = players[i]!;
  const states = foodNetworkStates(map, p);
  const plan = planFoodFixes(map, p, states);
  const nets = states.map((n) => `${n.villages.length}v bal=${n.balance} ${n.pressure} stock=${n.stock}`).join(' | ');
  log(`t${sim.turn} P${i} skills=${p.skills.join(',')} roadsSkill=${hasSkill(p, SkillId.ROADS)} $${p.resources.money} w${p.resources.wood} s${p.resources.stone} nets=[${nets}] planRoads=${plan.roads.length} planPorts=${plan.ports.length}`);
};
console.log = (): void => {};
sim.startGame();
let guard = 0;
while (!sim.gameOver && sim.turn < turns && guard++ < turns * 2) {
  sim.currentPlayerIndex = 0;
  if (players[0]!.isActive) anySim.runAiTurn(0);
  sim.applyCommand({ type: 'endTurn' });
  sim.drainEvents();
}
