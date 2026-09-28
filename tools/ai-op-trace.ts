/** One all-AI game with every seat running operations; prints each seat's operation state per turn. */
import { generateMap } from '../src/game/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/explore';
import { hexDistance } from '../src/game/hex';
import { exploreVillageSights } from '../src/game/village';

const seed = Number(process.argv.slice(2).filter((a) => a !== '--')[0] ?? 1000);
const players = buildPlayers(TRIBES[0]!.id as Tribe, 3, new SeededRandom(seed), 'hard');
for (const p of players) { p.isHuman = false; p.aiEngine = 'live'; }
const map = generateMap(players.length, seed);
for (const p of players) { initialExplorationFor(map, p.index); exploreVillageSights(map, p.index); }
const sim = new Simulator(map, players, 'capture', { rng: new SeededRandom(seed + 1).next.bind(new SeededRandom(seed + 1)), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
const any = sim as unknown as { runAiTurn(i: number): void };
const orig = any.runAiTurn.bind(sim);
any.runAiTurn = (i: number): void => {
  orig(i);
  const p = players[i]!;
  const units = map.tiles.filter((t) => t.unit?.owner === i).length;
  const v = map.tiles.filter((t) => t.settlement?.owner === i).length;
  const op = p.operation;
  if (op && sim.turn >= 19 && sim.turn <= 24) {
    const us = map.tiles.filter((t) => t.unit?.owner === i).map((t) => `${t.unit!.type}@${t.q},${t.r}${t.settlement?.owner === i ? '(V)' : ''}${t.terrain.toString().includes('ater') ? '(W)' : ''} dR=${hexDistance(t, op.rally)} dT=${hexDistance(t, op.target)} hp=${t.unit!.hp} mv=${t.unit!.hasMoved ? 1 : 0}`);
    console.log('   ' + us.join('\n   '));
  }
  console.log(`t${sim.turn} P${i} ${p.tribe} units=${units} vill=${v} $${p.resources.money} goals=${p.strategy?.goals.map((g) => g.id).join('+')} op=${op ? `${op.phase} tgt=${op.target.q},${op.target.r} rally=${op.rally.q},${op.rally.r} leash=${op.leash} since=${op.startTurn}` : '-'}`);
};
sim.startGame();
let g = 0;
while (!sim.gameOver && sim.turn < 40 && g++ < 80) {
  sim.currentPlayerIndex = 0;
  if (players[0]!.isActive) any.runAiTurn(0);
  sim.applyCommand({ type: 'endTurn' });
  sim.drainEvents();
}
