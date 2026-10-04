import { BuildingKind, CommandType, GameMode, SkillId, TutorialStepId, UnitType } from '@enums';
import { describe, expect, it } from 'vitest';
import { TutorialDirector, type TutorialHost } from '@/controller/tutorial-director';
import { hexDistance } from '@/game/hex';
import { tileAt } from '@/game/selection';
import { Simulator } from '@/game/simulator';
import { isWaterType } from '@/game/tile-types';
import {
  buildTutorialMap, buildTutorialPlayers, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_HUMAN,
  TUTORIAL_PORT_TILE,
} from '@/game/tutorial/tutorial-map';
import { makeUnit } from '@/game/units';

function makeSim(): Simulator {
  const sim = new Simulator(buildTutorialMap(), buildTutorialPlayers(), GameMode.TURNS30, { rng: () => 0.99 });
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
  return sim.map.tiles.find((t) => t.unit?.type === UnitType.ARCHER)!.unit!;
}

function ownShipTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined)!;
}

function dummyTile(sim: Simulator) {
  return sim.map.tiles.find((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)!;
}

/** Drives the land + archer segment. Ends on the `upgradeVillage3` step. */
function playToNavalStart(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe(TutorialStepId.MOVE_UNIT);
  run(sim, dir, { type: CommandType.MOVE, unitId: warriorUnit(sim).id, q: 1, r: -1 });
  expect(dir.currentStep()).toBe(TutorialStepId.UPGRADE_VILLAGE);
  run(sim, dir, { type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0 });
  expect(dir.currentStep()).toBe(TutorialStepId.OPEN_FORESTRY);
  run(sim, dir, { type: CommandType.OPEN_SKILL, skill: SkillId.FORESTRY });
  expect(dir.currentStep()).toBe(TutorialStepId.END_TURN1);
  run(sim, dir, { type: CommandType.END_TURN });
  expect(dir.currentStep()).toBe(TutorialStepId.END_TURN2);
  run(sim, dir, { type: CommandType.END_TURN });
  expect(dir.currentStep()).toBe(TutorialStepId.BUILD_SAWMILL);
  run(sim, dir, { type: CommandType.BUILD, q: 0, r: 1, kind: BuildingKind.SAWMILL });
  expect(dir.currentStep()).toBe(TutorialStepId.OPEN_CLIMBING_SMITHERY);
  run(sim, dir, { type: CommandType.OPEN_SKILL, skill: SkillId.CLIMBING });
  run(sim, dir, { type: CommandType.OPEN_SKILL, skill: SkillId.SMITHERY });
  expect(dir.currentStep()).toBe(TutorialStepId.BUILD_MINE);
  run(sim, dir, { type: CommandType.BUILD, q: 2, r: -2, kind: BuildingKind.MINE });
  expect(dir.currentStep()).toBe(TutorialStepId.SPAWN_ARCHER);
  run(sim, dir, { type: CommandType.SPAWN, q: 0, r: 0, unitType: UnitType.ARCHER });
  expect(dir.currentStep()).toBe(TutorialStepId.ATTACK_ENEMY);

  // The freshly-spawned archer cannot act until the next turn.
  run(sim, dir, { type: CommandType.END_TURN });
  const archer = archerUnit(sim);
  const enemy = dummyTile(sim);
  expect(isWaterType(enemy.terrain)).toBe(false); // land warrior lesson
  const firing = sim.map.tiles.find(
    (t) => !t.unit && hexDistance(t, enemy) <= 2 && hexDistance(t, archer) <= 1 && !isWaterType(t.terrain),
  )!;
  run(sim, dir, { type: CommandType.MOVE, unitId: archer.id, q: firing.q, r: firing.r });
  run(sim, dir, { type: CommandType.ATTACK, unitId: archerUnit(sim).id, q: enemy.q, r: enemy.r });
  expect(dir.currentStep()).toBe(TutorialStepId.UPGRADE_VILLAGE3);
  // Enemy stays on the map until the player kills it or the tutorial ends.
  expect(sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER)).toBe(true);
}

/** Opens Water + Navigation and upgrades the village to level 3. */
function playNavalSkills(sim: Simulator, dir: TutorialDirector): void {
  expect(dir.currentStep()).toBe(TutorialStepId.UPGRADE_VILLAGE3);
  run(sim, dir, { type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0 });
  expect(dir.currentStep()).toBe(TutorialStepId.OPEN_WATER_NAVIGATION);
  run(sim, dir, { type: CommandType.OPEN_SKILL, skill: SkillId.WATER });
  expect(dir.currentStep()).toBe(TutorialStepId.OPEN_WATER_NAVIGATION);
  run(sim, dir, { type: CommandType.OPEN_SKILL, skill: SkillId.NAVIGATION });
  expect(dir.currentStep()).toBe(TutorialStepId.BUILD_PORT);
}

describe('TutorialDirector', () => {
  it('walks the full land + naval path to the end step', () => {
    const sim = makeSim();
    const dir = makeDirector(sim);
    dir.start();
    expect(dir.currentStep()).toBe(TutorialStepId.WELCOME);
    dir.welcomeClosed();
    playToNavalStart(sim, dir);
    playNavalSkills(sim, dir);

    const port = tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!;
    expect(port.unit).toBeNull();
    run(sim, dir, { type: CommandType.BUILD, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: BuildingKind.PORT });
    expect(dir.currentStep()).toBe(TutorialStepId.BOARD_SHIP);

    // Warrior is staged on a land tile adjacent to the port.
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    expect(isWaterType(warrior.terrain)).toBe(false);
    expect(hexDistance(warrior, port)).toBe(1);
    expect(port.unit).toBeNull();

    run(sim, dir, { type: CommandType.MOVE, unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    expect(dir.currentStep()).toBe(TutorialStepId.UPGRADE_SHIP);

    const ship = ownShipTile(sim);
    expect(ship.unit!.shipLevel).toBe(1);
    // Upgrading is allowed the same turn the ship formed.
    run(sim, dir, { type: CommandType.UPGRADE_SHIP, unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe(TutorialStepId.ATTACK_ENEMY_SHIP);

    const enemyShip = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID)!;
    expect(isWaterType(enemyShip.terrain)).toBe(true);
    expect(hexDistance(enemyShip, ship)).toBe(3);

    // Freshly converted ship cannot act until next turn.
    run(sim, dir, { type: CommandType.END_TURN });
    expect(dir.currentStep()).toBe(TutorialStepId.ATTACK_ENEMY_SHIP);

    const s2 = ownShipTile(sim);
    const firingWater = sim.map.tiles.find(
      (t) => !t.unit && isWaterType(t.terrain) && hexDistance(t, s2) <= 3 && hexDistance(t, enemyShip) <= 2,
    )!;
    run(sim, dir, { type: CommandType.MOVE, unitId: s2.unit!.id, q: firingWater.q, r: firingWater.r });
    run(sim, dir, { type: CommandType.ATTACK, unitId: ownShipTile(sim).unit!.id, q: enemyShip.q, r: enemyShip.r });
    expect(dir.currentStep()).toBe(TutorialStepId.COLLECT_BONUS);

    // A bonus appears next to a land unit (the archer).
    const bonusTile = sim.map.tiles.find((t) => t.bonus !== undefined && t.bonus !== null)!;
    const archer = sim.map.tiles.find((t) => t.unit?.type === UnitType.ARCHER)!;
    expect(isWaterType(bonusTile.terrain)).toBe(false);
    expect(hexDistance(bonusTile, archer)).toBeLessThanOrEqual(1);
    expect(bonusTile.unit).toBeNull();

    run(sim, dir, { type: CommandType.MOVE, unitId: archer.unit!.id, q: bonusTile.q, r: bonusTile.r });
    expect(dir.currentStep()).toBe(TutorialStepId.COLLECT_BONUS);
    // The bonus can only be claimed on the next turn.
    run(sim, dir, { type: CommandType.END_TURN });
    expect(dir.currentStep()).toBe(TutorialStepId.COLLECT_BONUS);
    run(sim, dir, { type: CommandType.CLAIM_BONUS });
    expect(dir.currentStep()).toBe(TutorialStepId.APPROACH_FREE_VILLAGE);

    // A free (neutral) village spawns next to the archer, outside the player's
    // own village territory.
    const freeVillage = sim.map.tiles.find((t) => t.settlement && t.settlement.owner === null)!;
    expect(isWaterType(freeVillage.terrain)).toBe(false);
    expect(freeVillage.unit).toBeNull();
    expect(freeVillage.ownedBy).toBeNull();
    expect(freeVillage.claimedByVillage).toBeNull();
    const archerAfterBonus = sim.map.tiles.find((t) => t.unit?.type === UnitType.ARCHER)!;
    expect(hexDistance(freeVillage, archerAfterBonus)).toBeLessThanOrEqual(1);

    // Claiming the bonus exhausted the archer; it can move onto the village
    // only after ending the turn.
    run(sim, dir, { type: CommandType.END_TURN });
    expect(dir.currentStep()).toBe(TutorialStepId.APPROACH_FREE_VILLAGE);
    run(sim, dir, { type: CommandType.MOVE, unitId: archerAfterBonus.unit!.id, q: freeVillage.q, r: freeVillage.r });
    expect(dir.currentStep()).toBe(TutorialStepId.CAPTURE_FREE_VILLAGE);
    // Capturing is only possible on the next turn once capture-ready is set.
    run(sim, dir, { type: CommandType.END_TURN });
    expect(dir.currentStep()).toBe(TutorialStepId.CAPTURE_FREE_VILLAGE);
    const onVillage = sim.map.tiles.find((t) => t.settlement && t.unit?.owner === TUTORIAL_HUMAN)!;
    run(sim, dir, { type: CommandType.CAPTURE, q: freeVillage.q, r: freeVillage.r, unitId: onVillage.unit!.id });
    expect(dir.currentStep()).toBe(TutorialStepId.END);
    expect(freeVillage.settlement?.owner).toBe(TUTORIAL_HUMAN);
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
    run(sim, dir, { type: CommandType.BUILD, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: BuildingKind.PORT });
    expect(dir.currentStep()).toBe(TutorialStepId.BOARD_SHIP);

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
    run(sim, dir, { type: CommandType.BUILD, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r, kind: BuildingKind.PORT });
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!;
    run(sim, dir, { type: CommandType.MOVE, unitId: warrior.unit!.id, q: TUTORIAL_PORT_TILE.q, r: TUTORIAL_PORT_TILE.r });
    const ship = ownShipTile(sim);
    // Occupy the preferred enemy tile (4,0) so the director must fall back.
    const blockerTile = tileAt(sim.map, 4, 0)!;
    blockerTile.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, UnitType.WARRIOR, 4, 0, { id: 'blocker', shipLevel: 1, spawnVillage: null });

    run(sim, dir, { type: CommandType.UPGRADE_SHIP, unitId: ship.unit!.id });
    expect(dir.currentStep()).toBe(TutorialStepId.ATTACK_ENEMY_SHIP);
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
    human.skills.push(SkillId.FORESTRY, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.WATER, SkillId.NAVIGATION);
    run(sim, dir, { type: CommandType.MOVE, unitId: warriorUnit(sim).id, q: 1, r: -1 });
    run(sim, dir, { type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0 });
    expect(dir.currentStep()).toBe(TutorialStepId.END_TURN1);
    run(sim, dir, { type: CommandType.END_TURN });
    run(sim, dir, { type: CommandType.END_TURN });
    expect(dir.currentStep()).toBe(TutorialStepId.BUILD_SAWMILL);
    expect(dir.afterCommand([])).toBe(false);
    expect(dir.currentStep()).toBe(TutorialStepId.BUILD_SAWMILL);
    run(sim, dir, { type: CommandType.BUILD, q: 0, r: 1, kind: BuildingKind.SAWMILL });
    expect(dir.currentStep()).toBe(TutorialStepId.BUILD_MINE); // climbing/smithery already open
  });
});
