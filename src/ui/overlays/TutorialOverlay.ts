import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { t } from '../../i18n';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';
import { STEP_CONFIG, stepCounter, type TutorialStepId } from '../../game/tutorial/tutorialSteps';
import { gameController } from '../../controller/gameController';

const WIDTH = 480;

export class TutorialOverlay {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private popup: Popup | null = null;
  private unsub: (() => void) | null = null;

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
    const active = s.screen === 'game' && s.tutorial && !s.texturesLoading;
    this.el.visible = active;
    if (!active) {
      this.clearPopup();
      return;
    }
    const step = s.tutorialStep;
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
        if (step === 'welcome') gameController.tutorialWelcomeClosed();
        else gameController.exitTutorial();
      },
    });
    const popup = new Popup({
      app: this.host.app,
      title,
      width: WIDTH,
      buttons: [btn],
      position: 'top',
      topY: 40,
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const body = makeLabel(text, {
      fontSize: 14,
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
      position: 'top',
      topY: 40,
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const body = makeLabel(text, {
      fontSize: 14,
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
