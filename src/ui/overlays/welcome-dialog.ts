import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { t } from '../../i18n';
import { Modal } from '../kit/modal';
import { makeSwitch } from '../kit/switch';
import { setWelcomeDismissed } from '../../storage/settings';
import { GameMode } from '@enums';

function welcomeLines(mode: GameMode): string[] {
  const intro = t('welcome.intro');
  const objective = mode === GameMode.CAPTURE ? t('welcome.capture') : t('welcome.score');
  const howTo = t('welcome.howTo');
  return [intro, objective, howTo];
}

/** A "don't show again" switch row that persists to the settings. */
function makeDontShowRow(): Container {
  const row = new Container();
  const toggle = makeSwitch(false, (checked) => setWelcomeDismissed(checked), {
    label: t('welcome.dontShow'),
  });
  toggle.el.position.set(0, 1);
  row.addChild(toggle.el);
  return row;
}

export class WelcomeDialog {
  private modal: Modal | null = null;

  mount(host: UIHost, root: Container): void {
    const mode = useGameStore.getState().mode;
    this.modal = new Modal({
      app: host.app,
      title: t('welcome.title'),
      lines: welcomeLines(mode),
      extra: makeDontShowRow(),
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
