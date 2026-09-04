import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { GameMode } from '../../game/gameMode';
import { type UIHost } from '../host';
import { t } from '../../i18n';
import { Modal } from '../kit/modal';

function welcomeLines(mode: GameMode): string[] {
  const intro = t('welcome.intro');
  const objective = mode === 'capture' ? t('welcome.capture') : t('welcome.score');
  const howTo = t('welcome.howTo');
  return [intro, objective, howTo];
}

export class WelcomeDialog {
  private modal: Modal | null = null;

  mount(host: UIHost, root: Container): void {
    const mode = useGameStore.getState().mode;
    this.modal = new Modal({
      app: host.app,
      title: t('welcome.title'),
      lines: welcomeLines(mode),
      closeOnEnter: true,
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    this.modal.mount(root);
  }

  hide(onDone: () => void): void {
    if (this.modal) this.modal.hide(onDone);
    else onDone();
  }

  destroy(): void {
    this.modal?.destroy();
    this.modal = null;
  }
}
