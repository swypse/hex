/** Per-turn stall trace of seat 0 (aggressive/hard) vs seat 1 (balanced/hard) in one 1v1 game:  npx vite-node tools/ai-stall-trace.ts -- [seed=5000] [turns=60] */
import { AiDifficulty, AiPersonalityId } from '@enums';
import { exploreVillageSights } from '../src/game/economy/village';
import { initialExplorationFor, isExploredFor } from '../src/game/map/explore';
import { hexDistance } from '../src/game/map/hex';
import { generateMap } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { villagesNeedingMine } from '../src/game/ai/economy/villages-needing-mine';
import { openingStage } from '../src/game/ai/economy/opening-stage';
import { canBuildMine } from '../src/game/economy/buildings';
import { ALL_AI_FLAGS_ON } from '../src/game/ai/config/flags';

import { bestSpawnableUnitType } from '../src/game/ai/spawn/best-spawnable-unit-type';
import { spawnWouldBeKilled } from '../src/game/ai/spawn/spawn-would-be-killed';
import { totalStock, canAffordAt } from '../src/game/economy/stock';
import { canSustainUnit, foodNetIncome, granaryCapacity } from '../src/game/economy/food';
import { unitSpawnCost } from '../src/game/units/units';
import { SpawnPreference } from '@enums';
import { canOpenSkill, skillCost } from '../src/game/skills';
import { canBuildFarm, canBuildGranary, BUILDING_COSTS } from '../src/game/economy/buildings';
import { foodPressure } from '../src/game/economy/food';
import { aiDebug } from '../src/game/ai/util/ai-debug';
const realLog = console.log.bind(console);
if (process.env.DEBUG_AI) aiDebug.enabled = true;
const args = process.argv.slice(2).filter((a) => a !== '--');
const seed = Number(args[0] ?? 5000), maxTurns = Number(args[1] ?? 60);
const players = buildPlayers(TRIBES[0]!.id as Tribe, 1, new SeededRandom(seed), AiDifficulty.NORMAL);
players.forEach((p, i) => { p.isHuman = false; p.difficulty = AiDifficulty.HARD; p.personality = i === 0 ? AiPersonalityId.AGGRESSIVE : AiPersonalityId.BALANCED; p.aiEngine = 'live'; p.aiFlags = { ...ALL_AI_FLAGS_ON }; });
const map = generateMap(2, seed);
for (const p of players) { initialExplorationFor(map, p.index); exploreVillageSights(map, p.index); }
const rng = new SeededRandom(seed + 1);
const sim = new Simulator(map, players, 'capture', { rng: rng.next.bind(rng), aiRng: () => new SeededRandom(seed * 7 + sim.turn) });
sim.startGame();
const run = sim as unknown as { runAiTurn(i: number): void };
let guard = 0;
while (!sim.gameOver && sim.turn < maxTurns && guard++ < maxTurns * 2) {
  sim.currentPlayerIndex = 0;
  if (process.env.DEBUG_AI) { console.log = (...a: unknown[]) => { if (String(a[0]).includes('[AI]')) realLog(a.slice(2).join(' ')); }; }
  run.runAiTurn(0);
  console.log = realLog;
  const me = players[0]!;
  if (process.env.EMPTY_DIAG) {
    const ev = map.tiles.filter((t) => t.settlement?.owner === 1 && !t.unit && isExploredFor(t, 0));
    const mine2 = map.tiles.filter((t) => t.unit?.owner === 0);
    for (const v of ev) { const near = mine2.map((u) => ({ u, d: hexDistance(u, v) })).sort((a, b) => a.d - b.d)[0]; if (near) realLog(`   EMPTYDIAG T${sim.turn} emptyV(${v.q},${v.r}) nearest own ${near.u.unit!.type} hp${near.u.unit!.hp} @(${near.u.q},${near.u.r}) d=${near.d} moved=${near.u.unit!.hasMoved} terrain=${near.u.terrain}`); }
  }
  if (process.env.WINTER_DIAG) { const own = map.tiles.filter((t) => t.ownedBy === 0); const gr = own.filter((t) => t.building?.kind === 'granary'); const farms = own.filter((t) => t.building?.kind === 'farm'); realLog(`   WINTER T${sim.turn} ${map.season} farms=${farms.length} granaries=${gr.length} stored=${gr.reduce((a, g) => a + (g.building!.food ?? 0), 0)} cap=${gr.reduce((a, g) => a + granaryCapacity(map, g), 0)} total=${totalStock(map, 0).food} net=${foodNetIncome(map, me)} units=${map.tiles.filter((t) => t.unit?.owner === 0).length} villages=${map.tiles.filter((t) => t.settlement?.owner === 0).map((t) => t.settlement!.level).join('/')}`); }
  if (process.env.GRANARY_DIAG) { const sites = map.tiles.filter((t) => canBuildGranary(map, t, me)); realLog(`   GRANARY T${sim.turn} skill=${me.skills.includes('granary' as never)} sites=${sites.length} afford=${sites.some((t) => canAffordAt(map, me, t, BUILDING_COSTS.granary))} cost=${JSON.stringify(BUILDING_COSTS.granary)} money=${me.resources.money} stock=${JSON.stringify(totalStock(map, 0))} opening=${openingStage(map, me) ?? '-'} canSmithery=${canOpenSkill(me, 'smithery' as never, map)} cost=${skillCost('smithery' as never, me.skills.length)} skills=${me.skills.join(',')}`); }
  if (process.env.FARM_DIAG) { const farmTiles = map.tiles.filter((t) => canBuildFarm(map, t, me)); const st = totalStock(map, 0); realLog(`   FARMDIAG T${sim.turn} pressure=${foodPressure(map, me)} farmSites=${farmTiles.length} afford=${farmTiles.some((t) => canAffordAt(map, me, t, BUILDING_COSTS.farm))} wood=${st.wood} stone=${st.stone} farms=${map.tiles.filter((t) => t.building?.kind === 'farm' && t.ownedBy === 0).length}`); }
  if (process.env.SPAWN_DIAG) for (const v of map.tiles.filter((t) => t.settlement?.owner === 0 && !t.unit)) {
    const ty = bestSpawnableUnitType(me, SpawnPreference.OFFENSE, map, v, (x) => !spawnWouldBeKilled(map, v, 0, x));
    const anyTy = bestSpawnableUnitType(me, SpawnPreference.OFFENSE, map, v);
    realLog(`   SPAWNDIAG T${sim.turn} v(${v.q},${v.r}) type=${ty} anyType=${anyTy}` + (ty ? ` cost=${JSON.stringify(unitSpawnCost(ty))} afford=${canAffordAt(map, me, v, unitSpawnCost(ty))} sustain=${canSustainUnit(map, me, ty, 6, v)}` : ''));
  }
  const mine = map.tiles.filter((t) => t.unit?.owner === 0);
  const enemyV = map.tiles.filter((t) => t.settlement && t.settlement.owner === 1 && isExploredFor(t, 0));
  const near = enemyV.length ? mine.filter((t) => hexDistance(t, enemyV[0]!) <= 5).length : 0;
  const foes = map.tiles.filter((t) => t.unit?.owner === 1).length;
  const goals = (me.strategy?.goals ?? []).map((g) => `${g.id}:${g.phase}${g.target ? `@${g.target.q},${g.target.r}` : ''}`).join(',');
  const op = (me as unknown as { operation?: { phase?: string } }).operation?.phase ?? '-';
  realLog(`T${String(sim.turn).padStart(2)} $${String(me.resources.money).padStart(3)} units ${String(mine.length).padStart(2)} (nearEnemyV ${near}) foeUnits ${foes} vill ${map.tiles.filter((t) => t.settlement?.owner === 0).length}/${map.tiles.filter((t) => t.settlement?.owner === 1).length} knownEnemyV ${enemyV.length} op ${op} food ${foodNetIncome(map, me)}/${totalStock(map, 0).food} opening ${openingStage(map, me) ?? '-'} needMine ${villagesNeedingMine(map, me).length} skills ${me.skills.length} needy[${villagesNeedingMine(map, me).map((v) => `L${v.settlement!.level} canMine=${map.tiles.some((t) => canBuildMine(map, t, me))} u=${v.unit ? 1 : 0}`).join(';')}] | ${goals}`);
  sim.applyCommand({ type: 'endTurn' });
  sim.drainEvents();
}
