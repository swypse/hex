import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/game/simulator';
import {
  buildTutorialMap, buildTutorialPlayers, TUTORIAL_PORT_TILE,
  TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER,
} from '../src/game/tutorial/tutorialMap';
import { TutorialDirector, type TutorialHost } from '../src/controller/tutorialDirector';
import { tileAt } from '../src/game/selection';
import { hexDistance } from '../src/game/hex';
import { isWaterType } from '../src/game/tileTypes';
import { makeUnit } from '../src/game/units';

function makeSim(): Simulator {
  const sim = new Simulator(buildTutorialMap(), buildTutorialPlayers(), 'turns30', { rng: () => 0.99 });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function makeDirector(sim: Simulator): TutorialDirector {
  const host: TutorialHost = { sim: () => sim };
  return new TutorialDirector(host);
}

function run(sim: Simulator, dir: TutorialDirector, cmd: Parameters<Simulator['applyCommand']>[0]): void {
  sim.applyCommand(cmd);
  dir.afterCommand(sim.drainEvents());
}

function warriorUnit(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
}

function archerUnit(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.type === 'archer')!.unit!;
}

function ownShipTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined)!;
}

function dummyTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)!;
}

/** Drives the land + archer segment. Ends on the `upgradeVillage3` step. */
function playToNavalStart(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe('moveUnit');
  run(sim, dir, { type: 'move', unitId: warriorUnit(sim).id, q: 1, r: -1 });
  expect(dir.currentStep()).toBe('upgradeVillage');
  run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
  expect(dir.currentStep()).toBe('openForestry');
  run(sim, dir, { type: 'openSkill', skill: 'forestry' });
  expect(dir.currentStep()).toBe('endTurn1');
  run(sim, dir, { type: 'endTurn' });
  expect(dir.currentStep()).toBe('endTurn2');
  run(sim, dir, { type: 'endTurn' });
  expect(dir.currentStep()).toBe('buildSawmill');
  run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
  expect(dir.currentStep()).toBe('openClimbingSmithery');
  run(sim, dir, { type: 'openSkill', skill: 'climbing' });
  run(sim, dir, { type: 'openSkill', skill: 'smithery' });
  expect(dir.currentStep()).toBe('buildMine');
  run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
  expect(dir.currentStep()).toBe('spawnArcher');
  run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
  expect(dir.currentStep()).toBe('attackEnemy');

  // The freshly-spawned archer cannot act until the next turn.
  run(sim, dir, { type: 'endTurn' });
  const archer = archerUnit(sim);
  const enemy = dummyTile(sim);
  expect(isWaterType(enemy.terrain)).toBe(false); // land warrior lesson
  const firing = sim.map.tiles.find(
    (t) => !t.unit && hexDistance(t, enemy) <= 2 && hexDistance(t, archer) <= 1 && !isWaterType(t.terrain),
  )!;
  run(sim, dir, { type: 'move', unitId: archer.id, q: firing.q, r: firing.r });
  run(sim, dir, { type: 'attack', unitId: archerUnit(sim).id, q: enemy.q, r: enemy.r });
  expect(dir.currentStep()).toBe('upgradeVillage3');
  expect(sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)).toBe(false);
}

/** Opens Water + Navigation and upgrades the village to level 3. */
function playNavalSkills(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe('upgradeVillage3');
  run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
  expect(dir.currentStep()).toBe('openWaterNavigation');
  run(sim, dir, { type: 'openSkill', skill: 'water' });
  expect(dir.currentStep()).toBe('openWaterNavigation');
  run(sim, dir, { type: 'openSkill', skill: 'navigation' });
  expect(dir.currentStep()).toBe('buildPort');
}

describe('TutorialDirector', () => {
  it('walks the full land + naval path to the end step', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    expect(dir.currentStep()).toBe('welcome');
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    const port = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    expect(port.unit).toBeNull();
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    expect(dir.currentStep()).toBe('boardShip');

    // Warrior is staged on a land tile adjacent to the port.
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    expect(isWaterType(warrior.terrain)).toBe(false);
    expect(hexDistance(warrior, port)).toBe(1);
    expect(port.unit).toBeNull();

    run(sim, dir, { type: 'move', unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    expect(dir.currentStep()).toBe('upgradeShip');

    const ship = ownShipTile(sim);
    expect(ship.unit!.shipLevel).toBe(1);
    // Upgrading is allowed the same turn the ship formed.
    run(sim, dir, { type: 'upgradeShip', unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe('attackEnemyShip');

    const enemyShip = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID)!;
    expect(isWaterType(enemyShip.terrain)).toBe(true);
    expect(hexDistance(enemyShip, ship)).toBe(3);

    // Freshly converted ship cannot act until next turn.
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('attackEnemyShip');

    const s2 = ownShipTile(sim);
    const firingWater = sim.map.tiles.find(
      (t) => !t.unit && isWaterType(t.terrain) && hexDistance(t, s2) <= 3 && hexDistance(t, enemyShip) <= 2,
    )!;
    run(sim, dir, { type: 'move', unitId: s2.unit!.id, q: firingWater.q, r: firingWater.r });
    run(sim, dir, { type: 'attack', unitId: ownShipTile(sim).unit!.id, q: enemyShip.q, r: enemyShip.r });
    expect(dir.currentStep()).toBe('collectBonus');

    // A bonus appears next to a land unit (the archer).
    const bonusTile = sim.map.tiles.find((t) => t.bonus !== undefined && t.bonus !== null)!;
    const archer = sim.map.tiles.find((t) => t.unit?.type === 'archer')!;
    expect(isWaterType(bonusTile.terrain)).toBe(false);
    expect(hexDistance(bonusTile, archer)).toBeLessThanOrEqual(1);
    expect(bonusTile.unit).toBeNull();

    run(sim, dir, { type: 'move', unitId: archer.unit!.id, q: bonusTile.q, r: bonusTile.r });
    expect(dir.currentStep()).toBe('collectBonus');
    // The bonus can only be claimed on the next turn.
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('collectBonus');
    run(sim, dir, { type: 'claimBonus' });
    expect(dir.currentStep()).toBe('end');
    expect(sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)).toBe(false);
  });

  it('repositions the Warrior next to the port before boarding', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    // Teleport the Warrior far away, then build the port; entering boardShip
    // must move the Warrior onto a free land tile adjacent to the port.
    const wTile = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    const wUnit = wTile.unit!;
    const far = tileAt(sim.map, -4, 0)!;
    expect(far.unit).toBeNull();
    wTile.unit = null;
    far.unit = wUnit;
    wUnit.q = far.q;
    wUnit.r = far.r;

    const portTile = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    expect(dir.currentStep()).toBe('boardShip');

    const after = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    expect(isWaterType(after.terrain)).toBe(false);
    expect(hexDistance(after, portTile)).toBe(1);
  });

  it('places the enemy ship elsewhere when the preferred water tile is occupied', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    const portTile = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    run(sim, dir, { type: 'build', q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: 'port' });
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    run(sim, dir, { type: 'move', unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    const ship = ownShipTile(sim);
    // Occupy the preferred enemy tile (4,0) so the director must fall back.
    const blockerTile = tileAt(sim.map, 4, 0)!;
    blockerTile.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', 4, 0, { id: 'blocker', shipLevel: 1, spawnVillage: null });

    run(sim, dir, { type: 'upgradeShip', unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe('attackEnemyShip');
    const enemyShip = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID)!;
    expect(enemyShip.q === 4 && enemyShip.r === 0).toBe(false);
    expect(isWaterType(enemyShip.terrain)).toBe(true);
    expect(hexDistance(enemyShip, ship)).toBe(3);
  });

  it('skips steps whose objective is already satisfied', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const human = sim.players[TUTORIAL_HUMAN]!;
    human.skills.push('forestry', 'climbing', 'smithery', 'water', 'navigation');
    run(sim, dir, { type: 'move', unitId: warriorUnit(sim).id, q: 1, r: -1 });
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    expect(dir.currentStep()).toBe('endTurn1');
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('buildSawmill');
    expect(dir.afterCommand([])).toBe(false);
    expect(dir.currentStep()).toBe('buildSawmill');
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    expect(dir.currentStep()).toBe('buildMine'); // climbing/smithery already open
  });
});
