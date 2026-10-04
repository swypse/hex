import {
  CORE_COMBAT,
  PLAYABLE_UNITS,
  UTILITY_UNITS,
  LOSS_THRESHOLD,
  WIN_THRESHOLD,
  dominance,
  duel,
  superStrong,
  superWeak,
  balanceStats,
  cheapBeatsCostly,
  detAt,
  effectiveCost,
  runDuels,
  symWin,
  UNIT_SKILL,
  WOOD_TO_MONEY,
  ORE_TO_MONEY,
  type Duels,
} from './balance';
import { UNIT_TYPES, unitTypeMaintenance } from './units';
import { MELEE_SLOTS, armyFor, armyUnitCost, runSkirmishMatrix, skirmishMeans } from './balance-skirmish';
import { BASELINE, type Baseline } from './baseline-data';
import { UnitType } from '@enums';

export const CAPTION: Record<UnitType, string> = {
  warrior: 'Warrior',
  rider: 'Rider',
  archer: 'Archer',
  swordsman: 'Swordsman',
  shield: 'Shield',
  catapult: 'Catapult',
  knight: 'Knight',
  pirate: 'Pirate',
  stalker: 'Stalker',
  builder: 'Builder',
  banner: 'Banner',
  berserker: 'Berserker',
  trapper: 'Trapper',
  stormcaller: 'Stormcaller',
  stunner: 'Stunner',
};

export const SEED = 12345;
export const TRIALS = 2000;

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function statLine(t: UnitType): string {
  const s = UNIT_TYPES[t];
  return `${CAPTION[t]}: attack ${s.attack}, defense ${s.defense}, HP ${s.maxHp}, range ${s.attackDistance}, move ${s.movePoints}${UNIT_SKILL[t] ? `, skill ${UNIT_SKILL[t]}` : ''}`;
}

function costLabel(t: UnitType): string {
  const s = UNIT_TYPES[t];
  let parts = [`${s.price} money`];
  if (s.priceWood) parts.push(`${s.priceWood} wood`);
  if (s.priceOre) parts.push(`${s.priceOre} ore`);
  return parts.join(' + ');
}

function turnsMatrix(duels: Duels): string {
  const head = ['| vs \\ attacks →', ...PLAYABLE_UNITS.map((b) => ` ${CAPTION[b]} `)].join('|') + '|';
  const sep = ['|---', ...PLAYABLE_UNITS.map(() => '----')].join('|') + '|';
  const rows = PLAYABLE_UNITS.map((a) => {
    const cells = PLAYABLE_UNITS.map((b) => {
      if (a === b) return ' — ';
      const d = detAt(duels, a, b);
      const winner = d.winner ? `${CAPTION[d.winner].toLowerCase()}` : 'draw';
      return ` ${d.turnsForA}(→${winner}) `;
    });
    return `| **${CAPTION[a]}** |${cells.join('|')}|`;
  });
  return [head, sep, ...rows].join('\n');
}

function winMatrix(duels: Duels): string {
  const head = ['| wins over →', ...PLAYABLE_UNITS.map((b) => ` ${CAPTION[b]} `)].join('|') + '|';
  const sep = ['|---', ...PLAYABLE_UNITS.map(() => '----')].join('|') + '|';
  const rows = PLAYABLE_UNITS.map((a) => {
    const cells = PLAYABLE_UNITS.map((b) => {
      if (a === b) return ' — ';
      const w = symWin(duels, a, b);
      const mark = w > 0.6 ? '🟢' : w < 0.4 ? '🔴' : '⚪';
      return ` ${mark} ${pct(w)} `;
    });
    return `| **${CAPTION[a]}** |${cells.join('|')}|`;
  });
  return [head, sep, ...rows].join('\n');
}

function effTable(duels: Duels): string {
  const stats = balanceStats(duels);
  const med = median(stats.map((s) => s.efficiency));
  const head = '| Unit | Effective cost | Win-rate | Efficiency |';
  const sep = '|------|---------------:|---------:|-----------:|';
  const rows = stats.map((s) => {
    const mark = s.efficiency > med * 1.5 ? ' 🟢' : s.efficiency < med * 0.6 ? ' 🔴' : '';
    return `| ${CAPTION[s.type]} | ${s.cost} | ${s.winRate.toFixed(2)} | ${s.efficiency.toFixed(2)}${mark} |`;
  });
  return [head, sep, ...rows].join('\n');
}


function dominanceTable(duels: Duels): string {
  const dom = dominance(duels);
  const head = '| Unit | Eff. cost | Upkeep | Mean win (core) | Beats ≥60% | Loses ≤40% | Beaten by |';
  const sep = '|------|----------:|-------:|----------------:|-----------:|-----------:|-----------|';
  const strong = new Set(superStrong(dom).map((d) => d.type));
  const weak = new Set(superWeak(dom).map((d) => d.type));
  const rows = [...dom]
    .sort((a, b) => b.meanWin - a.meanWin)
    .map((d) => {
      const flag = strong.has(d.type) ? ' 🟢 super-strong' : weak.has(d.type) ? ' 🔴 super-weak' : '';
      return `| ${CAPTION[d.type]}${flag} | ${effectiveCost(d.type)} | ${unitTypeMaintenance(d.type)} | ${d.meanWin.toFixed(2)} | ${d.beats.length} | ${d.beatenBy.length} | ${d.beatenBy.map((t) => CAPTION[t]).join(', ') || '—'} |`;
    });
  const util = UTILITY_UNITS.map((t) => CAPTION[t]).join(', ');
  return [
    `Core combat roster only (${CORE_COMBAT.length} units); utility units (${util}) are judged on their abilities and excluded.`,
    `Super-strong = beats ≥ ⅔ of the roster at ≥${pct(WIN_THRESHOLD)} and nothing beats it at ≥${pct(WIN_THRESHOLD)} (its worst matchup is above ${pct(LOSS_THRESHOLD)}).`,
    `Super-weak = beats nothing and is beaten (≤${pct(LOSS_THRESHOLD)}) by ≥ ⅔ of the roster.`,
    '',
    head,
    sep,
    ...rows,
  ].join('\n');
}

function costCurve(duels: Duels): string {
  const dom = dominance(duels);
  const head = '| Unit | Eff. cost | Mean win (core) | Win per 10 cost |';
  const sep = '|------|----------:|----------------:|----------------:|';
  const rows = [...dom]
    .sort((a, b) => effectiveCost(a.type) - effectiveCost(b.type))
    .map((d) => `| ${CAPTION[d.type]} | ${effectiveCost(d.type)} | ${d.meanWin.toFixed(2)} | ${((d.meanWin / effectiveCost(d.type)) * 10).toFixed(2)} |`);
  return [head, sep, ...rows].join('\n');
}

function catapultSensitivity(): string {
  const rng = () => 1;
  const foes = CORE_COMBAT.filter((t) => t !== UnitType.CATAPULT);
  const head = '| Opponent | Catapult starts in range (free volleys) | Catapult ambushed at distance 1 |';
  const sep = '|----------|:---:|:---:|';
  const rows = foes.map((f) => {
    const a = duel(UnitType.CATAPULT, f, rng);
    const b = duel(UnitType.CATAPULT, f, rng, 100, undefined, { startDist: 1 });
    const label = (d: ReturnType<typeof duel>) => (d.winner === UnitType.CATAPULT ? 'catapult' : d.winner === f ? CAPTION[f].toLowerCase() : 'draw');
    return `| ${CAPTION[f]} | ${label(a)} | ${label(b)} |`;
  });
  return [head, sep, ...rows].join('\n');
}

function skirmishSection(): string {
  const out: string[] = [];
  for (const upkeep of [0, 5]) {
    const m = runSkirmishMatrix(96, upkeep);
    const means = skirmishMeans(m);
    const head = '| Unit | Unit cost | Army size | Mean win vs other armies |';
    const sep = '|------|----------:|----------:|-------------------------:|';
    const rows = CORE_COMBAT.map((t) => ({ t, w: means[t]! }))
      .sort((a, b) => b.w - a.w)
      .map(({ t, w }) => `| ${CAPTION[t]} | ${armyUnitCost(t, upkeep)} | ${armyFor(t, 96, upkeep).length} | ${w.toFixed(2)} |`);
    out.push(upkeep === 0 ? '**Purchase price only**' : `**Price + ${upkeep} turns of upkeep**`, '', head, sep, ...rows, '');
  }
  return out.join('\n');
}

function verdict(duels: Duels): string {
  const dom = dominance(duels);
  const strong = superStrong(dom);
  const weak = superWeak(dom);
  const lines: string[] = [];
  lines.push(strong.length === 0 ? '- **Super-strong:** none.' : `- **Super-strong:** ${strong.map((d) => CAPTION[d.type]).join(', ')}.`);
  lines.push(weak.length === 0 ? '- **Super-weak:** none.' : `- **Super-weak:** ${weak.map((d) => CAPTION[d.type]).join(', ')}.`);
  return lines.join('\n');
}

function changesTable(): string {
  const changed = PLAYABLE_UNITS.filter((t) => {
    const cur = UNIT_TYPES[t];
    const pre = BASELINE.units[t];
    return (
      cur.attack !== pre.attack ||
      cur.defense !== pre.defense ||
      cur.maxHp !== pre.maxHp ||
      cur.price !== pre.price ||
      cur.priceWood !== pre.priceWood ||
      cur.priceOre !== pre.priceOre
    );
  });
  if (changed.length === 0) return '*No stat changes detected — live stats match the pre-rebalance baseline.*';
  const head = '| Unit | Stat | Before | After |';
  const sep = '|------|------|-------:|------:|';
  const rows: string[] = [];
  for (const t of changed) {
    const cur = UNIT_TYPES[t];
    const pre = BASELINE.units[t];
    if (cur.attack !== pre.attack) rows.push(`| ${CAPTION[t]} | attack | ${pre.attack} | **${cur.attack}** |`);
    if (cur.defense !== pre.defense) rows.push(`| ${CAPTION[t]} | defense | ${pre.defense} | **${cur.defense}** |`);
    if (cur.maxHp !== pre.maxHp) rows.push(`| ${CAPTION[t]} | HP | ${pre.maxHp} | **${cur.maxHp}** |`);
    if (cur.price !== pre.price) rows.push(`| ${CAPTION[t]} | price | ${pre.price} | **${cur.price}** |`);
    if (cur.priceWood !== pre.priceWood) rows.push(`| ${CAPTION[t]} | wood | ${pre.priceWood} | **${cur.priceWood}** |`);
    if (cur.priceOre !== pre.priceOre) rows.push(`| ${CAPTION[t]} | ore | ${pre.priceOre} | **${cur.priceOre}** |`);
  }
  return [head, sep, ...rows].join('\n');
}

function flagsSection(duels: Duels): string {
  const lines: string[] = [];
  for (const f of BASELINE.flags) {
    lines.push(`- **Before:** ${CAPTION[f.cheaper as UnitType]} (${effectiveCost(f.cheaper as UnitType)}) beat the pricier ${CAPTION[f.pricier as UnitType]} at ${pct(f.win)} — cheap-but-strong / expensive-but-weak.`);
  }
  lines.push('');
  const post = cheapBeatsCostly(duels);
  if (post.length === 0) {
    lines.push('**After:** no cheap-beats-costly pair remains (verified live).');
  } else {
    for (const f of post) {
      lines.push(`- **After:** ${CAPTION[f.cheaper]} still beats ${CAPTION[f.pricier]} at ${pct(f.win)}.`);
    }
  }
  return lines.join('\n');
}

function interpretation(baseline: Baseline): string {
  const medBefore = median(PLAYABLE_UNITS.map((t) => baseline.stats[t]?.efficiency ?? 0));
  const weakBefore = PLAYABLE_UNITS.filter((t) => baseline.stats[t] && baseline.stats[t]!.efficiency < medBefore * 0.6);
  const strongBefore = PLAYABLE_UNITS.filter((t) => baseline.stats[t] && baseline.stats[t]!.efficiency > medBefore * 1.5);
  return [
    `- **Warrior** stays the cheapest cost-efficient baseline (4 money, no skill) and is never the strictly-best duelist.`,
    `- **Rider** was expensive-but-weak (lost 92% to a warrior despite costing more + the Riding skill); now it trades ~50/50 while keeping its scouting move-40 role.`,
    `- **Archer** was the most cost-inefficient cheap unit; its ranged-only damage got a small attack boost.`,
    `- **Knight** was a strictly-inferior swordsman (lost every 1:1 to the cheaper, tankier swordsman); its duel power was raised so the expensive knight stands on equal footing head-to-head.`,
    `- **Catapult** stays the glass-cannon siege specialist; fast melee (knight/rider) is its intended counter, not a balance bug.`,
    `- **Knight** attack was later cut 46 → 40 and the swordsman is now its only (coin-flip) counter; see the Dominance section for the live verdict.`,
    `- **Trapper / Stormcaller** were repriced to 6 money + 2 ore (effective 10) with +4 HP; **Berserker** to 10 money + 2 ore. See unit-balance-report.md.`,
  ].join('\n');
}

/** Full live markdown report over the current UNIT_TYPES. */
export function buildReport(): string {
  const duels = runDuels(SEED, TRIALS);
  return [
    '# Combat balance report',
    '',
    '> **Auto-generated** on every test run by `tests/balance-report.test.ts` from the live',
    '> `UNIT_TYPES` table in `src/game/units.ts`. Do not edit by hand; edit the sim in',
    '> `src/game/balance.ts` / the report template in `src/game/balance-report.ts` instead.',
    '',
    '## Method',
    '',
    `Unit-vs-unit duels on open terrain (no defensive bonus), driven by the real combat formula`,
    `(\`resolveCombat\` + \`COMBAT_SCALE\` 1.5 + 10% miss). Each pair fights twice (both attack`,
    `orders) and the two directed results are averaged so first-strike bias cancels out. A unit`,
    `out of range closes \`movePoints / 10\` hexes per turn before attacking; ranged units (archer,`,
    `catapult) therefore get free volleys while closing. Monte-Carlo: ${TRIALS} seeded trials per`,
    `directed pair, seed ${SEED}. Also modelled: berserker rage (+attack, a raging berserker does not`,
    `counter, as in \`canCounterAttack\`), stalker first strike (ignores defense) and catapults that`,
    `cannot fire in a turn they moved. Not modelled in duels (only in the skirmish section): banner`,
    `aura and the knight's extra attack. Never modelled: stun, traps, storm, building, terrain, healing.`,
    '',
    `Effective cost = money + ${WOOD_TO_MONEY}×wood + ${ORE_TO_MONEY}×ore + one-time skill-gate cost` +
      ` (skill price \`3 × level + 2 × opened\`, summed over the skill's prerequisite chain).`,
    '',
    '## Units (live stats)',
    '',
    ...PLAYABLE_UNITS.map((t) => `- ${statLine(t)} — spawn cost **${costLabel(t)}**`),
    '',
    '## Turns-to-kill matrix (deterministic, no-miss)',
    '',
    'Row unit attacks; cell shows attack-turns needed and the winner of that duel.',
    '',
    turnsMatrix(duels),
    '',
    '## Win-rate matrix (Monte-Carlo, symmetrised)',
    '',
    '🟢 row wins ≥60%, ⚪ 40–60%, 🔴 row wins ≤40%.',
    '',
    winMatrix(duels),
    '',
    '## Cost efficiency (live)',
    '',
    effTable(duels),
    '',
    '## Dominance (core combat roster)',
    '',
    verdict(duels),
    '',
    dominanceTable(duels),
    '',
    '## Cost vs power (core roster)',
    '',
    costCurve(duels),
    '',
    '## Catapult sensitivity to starting distance',
    '',
    'The catapult cannot fire in a turn it moved. The default duel starts it in range (the enemy walks in and eats free volleys); this compares with an ambush at distance 1.',
    '',
    catapultSensitivity(),
    '',
    `## Equal-budget skirmish (budget 96, ≤${MELEE_SLOTS} melee attackers per target)`,
    '',
    'Mono-army vs mono-army with the same budget: focus fire, banner aura, knight extra attack, rage, ranged free volleys during the approach. No terrain, no population cap, no village capacity — mass is flattered.',
    '',
    skirmishSection(),
    '## Balance flags',
    '',
    flagsSection(duels),
    '',
    '## Applied changes (vs pre-rebalance baseline)',
    '',
    changesTable(),
    '',
    '## Notes',
    '',
    interpretation(BASELINE),
    '',
  ].join('\n');
}