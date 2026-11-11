import { AiActionType } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { tribeById } from '../../tribes';
import { personalityFor } from '../config/personality';
import { difficultyFor } from '../config/difficulty';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';
import type { AiDirectives } from '../types/directives';
import type { AiOperation } from '../types/operation';
import type { AiStrategyState } from '../types/strategy-state';
import type { Candidate } from '../planner/candidates/candidate';

/** `aidebug` cheat: console log of every AI turn (situation, strategy, patterns, actions). */
export const aiDebug = { enabled: false };

const log = (...args: unknown[]): void => console.log('%c[AI]', 'color:#e8a33d;font-weight:bold', ...args);
const pos = (t: { q: number; r: number } | null | undefined): string => (t ? `(${t.q},${t.r})` : '-');
const tribeName = (p: Player): string => (tribeById(p.tribe)?.name ?? String(p.tribe)).toUpperCase();

function describe(map: GameMap, a: AiAction): string {
  const unit = 'unitId' in a ? map.tiles.find((t) => t.unit?.id === a.unitId)?.unit : undefined;
  const who = unit ? `${unit.type}#${unit.id} hp${unit.hp}@${pos(unit)}` : 'unitId' in a ? a.unitId : '';
  const { type, ...rest } = a as AiAction & Record<string, unknown>;
  const extra = Object.entries(rest).filter(([k]) => k !== 'unitId' && k !== 'q' && k !== 'r').map(([k, v]) => `${k}=${String(v)}`).join(' ');
  const at = 'q' in a ? ` ${type === AiActionType.MOVE ? '->' : '@'}${pos(a)}` : '';
  const tgt = 'q' in a ? map.tiles.find((t) => t.q === a.q && t.r === a.r) : undefined;
  const hit = (type === AiActionType.ATTACK || type === AiActionType.STUN) && tgt ? ` [${tgt.unit ? `${tgt.unit.type} hp${tgt.unit.hp} owner${tgt.unit.owner}` : tgt.settlement ? 'village' : tgt.building ? tgt.building.kind : '?'}]` : '';
  return `${type.toUpperCase()} ${who}${at}${hit}${extra ? ` ${extra}` : ''}`.replace(/\s+/g, ' ').trim();
}

function census(map: GameMap, p: Player): string {
  const units: Record<string, number> = {};
  let villages = 0;
  let empty = 0;
  for (const t of map.tiles) {
    if (t.unit?.owner === p.index) units[t.unit.type] = (units[t.unit.type] ?? 0) + 1;
    if (t.settlement?.owner === p.index) { villages++; if (!t.unit) empty++; }
  }
  const u = Object.entries(units).map(([k, v]) => `${v}x${k}`).join(' ') || 'none';
  return `villages ${villages} (${empty} empty) | units ${u}`;
}

export function logTurnStart(map: GameMap, p: Player, turn: number): void {
  log(`===== AI TURN START ${tribeName(p)} ===== turn ${turn} P${p.index} ${personalityFor(p).id}/${difficultyFor(p)} | money ${p.resources.money} | score ${p.score} | skills [${p.skills.join(',')}]`);
  log(`  own: ${census(map, p)}`);
}

export function logSituation(s: AiSituation, why: string): void {
  const enemies = s.enemies.map((e) => `${e.unit.type}@${pos(e.tile)}`).join(' ') || 'none';
  const dangers = s.dangers.map((d) => `${pos(d.village)} in ${d.enemyTurns}t`).join(' ') || 'none';
  const free = s.freeVillages.slice(0, 3).map((f) => `${pos(f.village)} d${f.distance}`).join(' ') || 'none';
  log(`  SITUATION (${why}): stance=${s.stance.toUpperCase()} power ${s.ownPower}/${s.enemyPower} (own/enemy) | visible enemies: ${enemies} | village dangers: ${dangers} | front ${pos(s.frontTarget)} | free villages: ${free}${s.navalThreat ? ` | NAVAL threat x${s.navalEnemies.length}` : ''}`);
}

export function logStrategy(st: AiStrategyState, d: AiDirectives, op: AiOperation | null | undefined, why: string): void {
  log(`  STRATEGY (${why}): goals [${st.goals.map((g) => `${g.id}:${g.phase}${g.target ? pos(g.target) : ''}`).join(', ') || 'none'}] next plan turn ${st.nextPlanTurn}`);
  log(`  DIRECTIVES: pace=${d.pace} reserve=${d.moneyReserve} front=${pos(d.frontTarget)} muster=${d.muster ? `at ${pos(d.muster.tile)} min ${d.muster.minUnits} -> ${pos(d.muster.target)}` : '-'} spawnPlan=[${d.spawnPlan.map((s) => `${s.villageKey}:${s.prefer}`).join(', ')}] skillChain=${d.skillChain ? `[${d.skillChain.join(',')}]` : '-'}`);
  log(`  OPERATION: ${op ? `${op.phase} target ${pos(op.target)} rally ${pos(op.rally)} since T${op.startTurn}${op.leash ? ' leash' : ''}` : 'none'}`);
}

export function logPick(candidates: Candidate[], random: boolean): void {
  if (candidates.length === 0) { log('    no pattern and no fallback candidates left: turn ends'); return; }
  const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 3);
  const name = (c: Candidate): string => (Array.isArray(c.action) ? c.action[0] : c.action)!.type;
  log(`    fallback candidates (${candidates.length}): ${top.map((c) => `${name(c)}=${c.score.toFixed(0)}`).join(', ')}${random ? ' | MISTAKE: picked random' : ''}`);
}

/** Describes steps before they run (positions and hp are the pre-action state). */
export function describeActions(map: GameMap, actions: AiAction[]): string[] {
  return actions.map((a) => describe(map, a));
}

export function logStep(step: number, id: string, described: string[], results: boolean[]): void {
  log(`  step ${step} [${id}]`);
  described.forEach((d, i) => log(`    ${results[i] === false ? 'FAILED ' : results[i] === undefined ? 'skipped ' : ''}${d}`));
}

export function logVeto(map: GameMap, id: string, actions: AiAction[], by: string): void {
  log(`  VETO(${by}) [${id}]: ${actions.map((a) => describe(map, a)).join(' ; ')}`);
}

export function logTurnEnd(map: GameMap, p: Player, steps: number, actions: AiAction[]): void {
  const counts: Record<string, number> = {};
  for (const a of actions) counts[a.type] = (counts[a.type] ?? 0) + 1;
  const idle = map.tiles.filter((t) => t.unit?.owner === p.index && !t.unit.hasMoved && !t.unit.hasAttacked && !t.settlement).length;
  log(`  summary: ${steps} steps, actions ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ') || 'none'} | money left ${p.resources.money} | idle field units ${idle}`);
  log(`  own: ${census(map, p)}`);
  log(`===== AI TURN END ${tribeName(p)} =====`);
}
