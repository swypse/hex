import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { GameMode } from '../../game/gameMode';
import { type UIHost } from '../host';
import { Modal } from '../kit/modal';

function welcomeLines(mode: GameMode): string[] {
  const intro = 'Welcome to Hex! Lead your tribe, expand your territory, and outwit the other tribes.';
  const objective =
    mode === 'capture'
      ? 'Objective — capture the map: conquer every village on the map. A tribe is eliminated when all of its villages are captured, and the last tribe standing wins.'
      : 'Objective — most points in 30 turns: earn points from territory, villages, kills, and upgrades. The tribe with the highest score when the game ends wins.';
  const howTo = 'Select a unit, then click a highlighted tile to move. Attack nearby enemies and capture undefended villages. End your turn when you are done.';
  return [intro, objective, howTo];
}

export class WelcomeDialog {
  private modal: Modal | null = null;

  mount(host: UIHost, root: Container): void {
    const mode = useGameStore.getState().mode;
    this.modal = new Modal({
      app: host.app,
      title: 'Welcome!',
      lines: welcomeLines(mode),
      closeOnEnter: true,
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    this.modal.mount(root);
  }

  destroy(): void {
    this.modal?.destroy();
    this.modal = null;
  }
}
