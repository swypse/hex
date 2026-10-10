import { describe, expect, it } from 'vitest';
import {
  aiVeteranBonus, applyVeteranBonus, movePoints, needsVeteranBonus, recordKill, unitMaxHp,
  UNIT_MOVE_POINTS, UNIT_TYPES, VETERAN_ATTACK_BONUS, VETERAN_HP_BONUS, VETERAN_MOVE_BONUS,
} from '../src/game/units/units';
import { attackBonus } from '../src/game/units/abilities';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { CommandType, GameEventType, GameMode } from '@enums';
import { UnitType, VeteranBonus } from '@enums';

function veteran(type = UnitType.WARRIOR) {
  const u = makeUnit('v', 0, type, 0, 0);
  for (let i = 0; i < 3; i++) recordKill(u);
  return u;
}

describe('veterans', () => {
  it('becomes a veteran on the 3rd kill, fully healed, with the bonus still pending', () => {
    const u = makeUnit('u', 0, UnitType.WARRIOR, 0, 0);
    u.hp = 5;
    expect(recordKill(u)).toBe(false);
    expect(recordKill(u)).toBe(false);
    expect(u.veteran).toBeUndefined();
    expect(u.hp).toBe(5);
    expect(recordKill(u)).toBe(true);
    expect(u.veteran).toBe(true);
    expect(u.hp).toBe(UNIT_TYPES.warrior.maxHp);
    expect(needsVeteranBonus(u)).toBe(true);
    expect(recordKill(u)).toBe(false);
  });

  it('never promotes pirates', () => {
    const p = makeUnit('p', -1, UnitType.PIRATE, 0, 0);
    for (let i = 0; i < 5; i++) expect(recordKill(p)).toBe(false);
    expect(p.veteran).toBeUndefined();
  });

  it('+5 attack raises the attack bonus', () => {
    const u = veteran();
    expect(attackBonus(u, null)).toBe(0);
    expect(applyVeteranBonus(u, VeteranBonus.ATTACK)).toBe(true);
    expect(attackBonus(u, null)).toBe(VETERAN_ATTACK_BONUS);
    expect(needsVeteranBonus(u)).toBe(false);
  });

  it('+10 hp raises the max and refills to it', () => {
    const u = veteran();
    u.hp = 7;
    applyVeteranBonus(u, VeteranBonus.HP);
    expect(unitMaxHp(u)).toBe(UNIT_TYPES.warrior.maxHp + VETERAN_HP_BONUS);
    expect(u.hp).toBe(unitMaxHp(u));
  });

  it('+20 move raises the move points', () => {
    const u = veteran();
    applyVeteranBonus(u, VeteranBonus.MOVE);
    expect(movePoints(u)).toBe(UNIT_MOVE_POINTS.warrior + VETERAN_MOVE_BONUS);
  });

  it('a bonus is picked only once', () => {
    const u = veteran();
    expect(applyVeteranBonus(u, VeteranBonus.ATTACK)).toBe(true);
    expect(applyVeteranBonus(u, VeteranBonus.HP)).toBe(false);
    expect(u.veteranBonus).toBe(VeteranBonus.ATTACK);
  });

  it('cannot give a bonus to a non-veteran', () => {
    expect(applyVeteranBonus(makeUnit('n', 0, UnitType.WARRIOR, 0, 0), VeteranBonus.ATTACK)).toBe(false);
  });

  it('the AI picks hp for support units and move for riders', () => {
    expect(aiVeteranBonus({ type: UnitType.SHIELD })).toBe(VeteranBonus.HP);
    expect(aiVeteranBonus({ type: UnitType.RIDER })).toBe(VeteranBonus.MOVE);
    expect(aiVeteranBonus({ type: UnitType.ARCHER })).toBe(VeteranBonus.ATTACK);
  });
});

describe('veteran promotion in the simulator', () => {
  function setup() {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    const hero = makeUnit('hero', 0, UnitType.WARRIOR, 0, 0);
    hero.kills = 2;
    hero.hp = 10;
    tileAt(map, 0, 0)!.unit = hero;
    const prey = makeUnit('prey', 1, UnitType.WARRIOR, 1, 0);
    prey.hp = 1;
    tileAt(map, 1, 0)!.unit = prey;
    tileAt(map, 0, 2)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 2)!.unit = makeUnit('foe2', 1, UnitType.WARRIOR, 0, 2);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[1]!.isHuman = true;
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    return { sim, hero };
  }

  it('promotes on the 3rd kill, heals fully, then lets the owner pick a bonus', () => {
    const { sim, hero } = setup();
    expect(sim.applyCommand({ type: CommandType.ATTACK, unitId: 'hero', q: 1, r: 0 })).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === GameEventType.VETERAN_PROMOTED && e.unitId === 'hero')).toBe(true);
    expect(hero.veteran).toBe(true);
    expect(hero.hp).toBe(UNIT_TYPES.warrior.maxHp);
    expect(needsVeteranBonus(hero)).toBe(true);
    expect(sim.applyCommand({ type: CommandType.CHOOSE_VETERAN_BONUS, unitId: 'hero', bonus: VeteranBonus.HP })).toBe(true);
    expect(unitMaxHp(hero)).toBe(UNIT_TYPES.warrior.maxHp + VETERAN_HP_BONUS);
    expect(hero.hp).toBe(unitMaxHp(hero));
    // Only once.
    expect(sim.applyCommand({ type: CommandType.CHOOSE_VETERAN_BONUS, unitId: 'hero', bonus: VeteranBonus.ATTACK })).toBe(false);
  });

  it('refuses a bonus for a unit that is not a veteran', () => {
    const { sim } = setup();
    expect(sim.applyCommand({ type: CommandType.CHOOSE_VETERAN_BONUS, unitId: 'hero', bonus: VeteranBonus.ATTACK })).toBe(false);
  });
});
