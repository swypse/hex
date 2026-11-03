/**
 * One all-AI game with every seat running the squad operation layer; prints
 * each seat's operation state per turn, and (for a chosen turn range) each
 * squad unit's distance to the rally/target hex. Useful for debugging why an
 * operation isn't gathering or advancing as expected.
 *
 *   npx vite-node tools/ai-op-trace.ts -- [seed=1000] [dumpFrom=0] [dumpTo=0]
 */
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/map/explore';
import { hexDistance } from '../src/game/map/hex';
import { exploreVillageSights } from '../src/game/economy/village';

const args = process.argv.slice(2).filter((a) => a !== '--');
const seed = Number(args[0] ?? 1000);
const dumpFrom = Number(args[1] ?? 0);
const dumpTo = Number(args[2] ?? 0);

const players = buildPlayers(TRIBES[0]!.id as Tribe, 3, new SeededRandom(seed), 'hard');
for (const p of players) {
  p.isHuman = false;
  p.aiEngine = 'live';
}
const map = generateMap(players.length, seed);
for (const p of players) {
  initialExplorationFor(map, p.index);
  exploreVillageSights(map, p.index);
}
const sim = new Simulator(map, players, 'capture', {
  rng: new SeededRandom(seed + 1).next.bind(new SeededRandom(seed + 1)),
  aiRng: () => new SeededRandom(seed * 7 + sim.turn),
});
const anySim = sim as unknown as { runAiTurn(i: number): void };
const original = anySim.runAiTurn.bind(sim);
anySim.runAiTurn = (i: number): void => {
  original(i);
  const p = players[i]!;
  const units = map.tiles.filter((t) => t.unit?.owner === i).length;
  const villages = map.tiles.filter((t) => t.settlement?.owner === i).length;
  const op = p.operation;
  if (op && sim.turn >= dumpFrom && sim.turn <= dumpTo) {
    const lines = map.tiles
      .filter((t) => t.unit?.owner === i)
      .map((t) => {
        const unit = t.unit!;
        const onVillage = t.settlement?.owner === i ? '(V)' : '';
        return `${unit.type}@${t.q},${t.r}${onVillage} dRally=${hexDistance(t, op.rally)} dTarget=${hexDistance(t, op.target)} hp=${unit.hp} moved=${unit.hasMoved ? 1 : 0}`;
      });
    console.log('   ' + lines.join('\n   '));
  }
  const opInfo = op ? `${op.phase} tgt=${op.target.q},${op.target.r} rally=${op.rally.q},${op.rally.r} leash=${op.leash} since=${op.startTurn}` : '-';
  console.log(`t${sim.turn} P${i} ${p.tribe} units=${units} vill=${villages} $${p.resources.money} goals=${p.strategy?.goals.map((g) => g.id).join('+')} op=${opInfo}`);
};
sim.startGame();
let guard = 0;
while (!sim.gameOver && sim.turn < 40 && guard++ < 80) {
  sim.currentPlayerIndex = 0;
  if (players[0]!.isActive) anySim.runAiTurn(0);
  sim.applyCommand({ type: 'endTurn' });
  sim.drainEvents();
}
