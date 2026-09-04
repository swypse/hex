import { Container, Graphics, Text } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { STEP_CONFIG, type TutorialStepId } from '../../game/tutorial/tutorialSteps';
import { gameController } from '../../controller/gameController';

const BANNER_MAX_WIDTH = 720;
const BANNER_TOP = 64;

export class TutorialOverlay {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private root: Container | null = null;
  private unsub: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.root = root;
    const el = new Container();
    this.el = el;
    root.addChild(el);
    this.refresh();
    this.unsub = useGameStore.subscribe(() => this.refresh());
  }

  private refresh(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const active = s.screen === 'game' && s.tutorial && !s.texturesLoading;
    this.el.visible = active;
    if (!active) return;
    while (this.el.children.length > 0) this.el.removeChildAt(0).destroy({ children: true });
    const step = s.tutorialStep;
    if (step === null) return;
    const def = STEP_CONFIG[step];
    if (def.dialog) {
      this.buildDialog(def.heading, def.text, def.buttonLabel, step);
    } else {
      this.buildBanner(def.heading, def.text);
    }
  }

  private buildDialog(title: string, text: string, buttonLabel: string, step: TutorialStepId): void {
    if (!this.el || !this.host) return;
    const cardW = 460;
    const tTitle = makeLabel(title, { fontSize: 22, fill: 0xffffff, fontWeight: '700' });
    const tBody = new Text({
      text,
      style: {
        fontFamily: 'Roboto',
        fontSize: 15,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardW - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    });
    const pad = 24;
    const gap = 14;
    const btn = new Button({
      label: buttonLabel,
      width: 200,
      onClick: () => {
        if (step === 'welcome') gameController.tutorialWelcomeClosed();
        else gameController.exitTutorial();
      },
    });
    const cardH = 24 + tTitle.height + gap + tBody.height + 16 + btn.height + 24;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;

    const backdrop = new Graphics();
    backdrop.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    backdrop.eventMode = 'static';
    // Welcome may be dismissed by clicking outside; the end dialog cannot.
    if (step === 'welcome') {
      backdrop.on('pointertap', () => gameController.tutorialWelcomeClosed());
    }
    this.el.addChild(backdrop);

    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x111111);
    card.addChild(bg);
    tTitle.position.set(pad, 24);
    tBody.position.set(pad, 24 + tTitle.height + gap);
    const btnY = 24 + tTitle.height + gap + tBody.height + 16;
    btn.position.set(cardW / 2 - btn.width / 2, btnY);
    card.addChild(tTitle, tBody, btn);
    card.position.set(w / 2 - cardW / 2, h / 2 - cardH / 2);
    this.el.addChild(card);
  }

  private buildBanner(heading: string, text: string): void {
    if (!this.el || !this.host) return;
    const screenW = this.host.app.screen.width;
    const tHead = makeLabel(heading, { fontSize: 18, fill: 0xffd700, fontWeight: '700' });
    const tBody = new Text({
      text,
      style: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: BANNER_MAX_WIDTH - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    });
    tHead.position.set(24, 16);
    tBody.position.set(24, 16 + tHead.height + 6);
    const panelW = Math.min(BANNER_MAX_WIDTH, screenW - 32);
    const panelH = 16 + tHead.height + 6 + tBody.height + 16;
    const panel = new Graphics();
    panel.roundRect(0, 0, panelW, panelH, 10).fill({ color: 0x000000, alpha: 0.72 });
    const box = new Container();
    box.addChild(panel, tHead, tBody);
    box.position.set(screenW / 2 - panelW / 2, BANNER_TOP);
    this.el.addChild(box);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.root = null;
  }
}
