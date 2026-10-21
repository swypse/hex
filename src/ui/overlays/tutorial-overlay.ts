import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { t } from '../../i18n';
import { Button } from '../kit/button';
import { makeLabel } from '../../gfx/label';
import { Popup } from '../kit/popup';
import { STEP_CONFIG, stepCounter } from '../../game/tutorial/tutorial-steps';
import { gameController } from '../../controller/game-controller';
import { FontSize, PopupPosition, Screen, TutorialStepId } from '@enums';

const WIDTH = 480;

export class TutorialOverlay {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private popup: Popup | null = null;
  private unsub: (() => void) | null = null;
  /** Step the popup shows (null: none), so unrelated store changes (selection, moves) leave it alone. */
  private shownStep: TutorialStepId | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    this.el = el;
    root.addChild(el);
    this.refresh();
    this.unsub = useGameStore.subscribe(() => this.refresh());
  }

  private clearPopup(): void {
    this.popup?.destroy();
    this.popup = null;
  }

  private refresh(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const active = s.screen === Screen.GAME && s.tutorial && !s.texturesLoading;
    this.el.visible = active;
    const step = active ? s.tutorialStep : null;
    if (step === this.shownStep && (step === null || this.popup)) return;
    this.shownStep = step;
    if (step === null) {
      this.clearPopup();
      return;
    }
    const def = STEP_CONFIG[step];
    const heading = `${stepCounter(step)} ${t(`tutorial.${step}.heading`)}`;
    this.clearPopup();
    if (def.dialog) {
      this.buildDialog(heading, t(`tutorial.${step}.text`), t(`tutorial.${step}.button`), step);
    } else {
      this.buildBanner(heading, t(`tutorial.${step}.text`));
    }
  }

  private buildDialog(title: string, text: string, buttonLabel: string, step: TutorialStepId): void {
    if (!this.el || !this.host) return;
    const btn = new Button({
      label: buttonLabel,
      width: 200,
      onClick: () => {
        if (step === TutorialStepId.END) gameController.exitTutorial();
        else gameController.tutorialContinue();
      },
    });
    const popup = new Popup({
      app: this.host.app,
      title,
      width: WIDTH,
      buttons: [btn],
      position: PopupPosition.TOP,
      topY: 40,
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const body = makeLabel(text, {
      fontSize: FontSize.SMALL,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    body.position.set(0, 0);
    popup.content.addChild(body);
    this.el.addChild(popup.el);
    this.popup = popup;
    popup.finish();
  }

  private buildBanner(title: string, text: string): void {
    if (!this.el || !this.host) return;
    const popup = new Popup({
      app: this.host.app,
      title,
      width: WIDTH,
      modal: false,
      interactive: false,
      position: PopupPosition.TOP,
      topY: 40,
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const body = makeLabel(text, {
      fontSize: FontSize.SMALL,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    body.position.set(0, 0);
    popup.content.addChild(body);
    this.el.addChild(popup.el);
    this.popup = popup;
    popup.finish();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.clearPopup();
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
