import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildTutorialMap, buildTutorialPlayers, TUTORIAL_CAPITAL } from '../src/game/tutorial/tutorialMap';
import { TutorialDirector, type TutorialHost } from '../src/controller/tutorialDirector';
import { tileAt } from '../src/game/selection';
import { hexDistance } from '../src/game/hex';

function makeSim(): Simulator {
  const sim = new Simulator(buildTutorialMap(), buildTutorialPlayers(), 'turns30', {
    rng: () => 0.99,
  });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function makeDirector(sim: Simulator): { dir: TutorialDirector; host: TutorialHost } {
  const host: TutorialHost = { sim: () => sim };
  return { dir: new TutorialDirector(host), host };
}

function run(sim: Simulator, dir: TutorialDirector, cmd: Parameters<Simulator['applyCommand']>[0]): boolean {
  sim.applyCommand(cmd);
  return dir.afterCommand(sim.drainEvents());
}

describe('TutorialDirector', () => {
  it('walks the full happy path to the end step', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    expect(dir.currentStep()).toBe('welcome');
    dir.welcomeClosed();
    expect(dir.currentStep()).toBe('moveUnit');

    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
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
    expect(dir.currentStep()).toBe('openClimbingSmithery');
    run(sim, dir, { type: 'openSkill', skill: 'smithery' });
    expect(dir.currentStep()).toBe('buildMine');

    run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
    expect(dir.currentStep()).toBe('spawnArcher');

    const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.unit).toBeNull();
    run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
    expect(dir.currentStep()).toBe('attackEnemy');

    // Enemy placed at distance 3 from the archer (on the capital).
    const enemy = sim.map.tiles.find((t) => t.unit?.id === 'tutor-enemy-warrior')!;
    expect(hexDistance(enemy, cap)).toBe(3);

    // Archer cannot act until next turn.
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('attackEnemy');

    const archer = sim.map.tiles.find((t) => t.unit?.type === 'archer')!.unit!;
    run(sim, dir, { type: 'move', unitId: archer.id, q: 1, r: 0 });
    run(sim, dir, { type: 'attack', unitId: archer.id, q: 2, r: 1 });
    expect(dir.currentStep()).toBe('end');

    // Enemy removed by the director.
    expect(sim.map.tiles.some((t) => t.unit?.id === 'tutor-enemy-warrior')).toBe(false);
  });

  it('skips steps whose objective is already satisfied', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const human = sim.players[0]!;
    human.resources = { money: 70, wood: 20, stone: 20, ore: 5 };
    human.skills.push('forestry', 'climbing', 'smithery');

    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
    expect(dir.currentStep()).toBe('upgradeVillage');

    // Upgrading completes upgradeVillage and, because Forestry is already open,
    // the director must skip straight past openForestry to endTurn1.
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    expect(dir.currentStep()).toBe('endTurn1');

    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('endTurn2');
    run(sim, dir, { type: 'endTurn' });
    expect(dir.currentStep()).toBe('buildSawmill');
    // No sawmill yet -> an empty event batch changes nothing.
    expect(dir.afterCommand([])).toBe(false);
    expect(dir.currentStep()).toBe('buildSawmill');

    // Building the sawmill skips openClimbingSmithery (already open) and stops
    // at buildMine (mine not built yet).
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    expect(dir.currentStep()).toBe('buildMine');
  });

  it('falls back to another tile when the preferred enemy tile is occupied', () => {
    const sim = makeSim();
    const { dir } = makeDirector(sim);
    dir.start();
    dir.welcomeClosed();
    const warrior = sim.map.tiles.find((t) => t.unit?.id === 'tutor-warrior')!.unit!;
    run(sim, dir, { type: 'move', unitId: warrior.id, q: 1, r: -1 });
    run(sim, dir, { type: 'upgradeVillage', q: 0, r: 0 });
    run(sim, dir, { type: 'openSkill', skill: 'forestry' });
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'endTurn' });
    run(sim, dir, { type: 'build', q: 0, r: 1, kind: 'sawmill' });
    run(sim, dir, { type: 'openSkill', skill: 'climbing' });
    run(sim, dir, { type: 'openSkill', skill: 'smithery' });
    run(sim, dir, { type: 'build', q: 2, r: -2, kind: 'mine' });
    // Park a unit on the preferred enemy tile (2,1).
    const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    const blocker = sim.map.tiles.find((t) => t.q === 2 && t.r === 1)!;
    blocker.unit = { ...warrior, id: 'blocker', q: 2, r: 1 };
    run(sim, dir, { type: 'spawn', q: 0, r: 0, unitType: 'archer' });
    expect(dir.currentStep()).toBe('attackEnemy');
    const enemy = sim.map.tiles.find((t) => t.unit?.id === 'tutor-enemy-warrior');
    expect(enemy).toBeDefined();
    expect(enemy!.q === 2 && enemy!.r === 1).toBe(false);
    expect(hexDistance(enemy!, cap)).toBe(3);
  });
});
