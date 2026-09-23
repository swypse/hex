import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { GameMode } from '../../game/game-mode';
import { type UIHost } from '../host';
import { t } from '../../i18n';
import { Modal } from '../kit/modal';
import { makeCheckbox } from '../kit/checkbox';
import { makeLabel } from '../kit/label';
import { setWelcomeDismissed } from '../../storage/settings';

function welcomeLines(mode: GameMode): string[] {
  const intro = t('welcome.intro');
  const objective = mode === 'capture' ? t('welcome.capture') : t('welcome.score');
  const howTo = t('welcome.howTo');
  return [intro, objective, howTo];
}

/** A "don't show again" checkbox row that persists to the settings. */
function makeDontShowRow(): Container {
  const row = new Container();
  const checkbox = makeCheckbox(false, (checked) => setWelcomeDismissed(checked));
  checkbox.el.position.set(0, 1);
  const label = makeLabel(t('welcome.dontShow'), { fontSize: 14, fill: 0xcccccc });
  label.position.set(30, 3);
  row.addChild(checkbox.el, label);
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
