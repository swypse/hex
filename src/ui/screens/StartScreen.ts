import { Application, Container, FillGradient, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { saveRepository } from '../../storage/saveGame';
import { loadSettings, setAiDifficulty, setAttackConfirmation, setTipsDisabled } from '../../storage/settings';
import { AiDifficulty } from '../../game/aiDifficulty';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeCheckbox } from '../kit/checkbox';
import { makeLabel } from '../kit/label';
import { Modal } from '../kit/modal';

const ABOUT_TEXT =
  'Hex is a turn-based strategy game on a hex map. Build and upgrade villages, train warriors, riders, archers, and swordsmen, research skills, and explore a procedurally generated world. Conquer rival tribes by capturing their villages or score the most points by the final turn. Play solo against AI or challenge friends in multiplayer.';

const IMAGE_BASE = `${import.meta.env.BASE_URL}images/`;

// Single uniform scale applied to both background images relative to their
// original pixel size, so they always render at the same relative size.
const BACKGROUND_SCALE = 1;

const MAIN_TOP = {
  file: 'main-top.png',
  width: 510,
  height: 396,
  anchor: { x: 1, y: 0 },
  offset: { x: 0.1, y: -0.5 },
} as const;
const MAIN_BOTTOM = {
  file: 'main-bottom.png',
  width: 589,
  height: 599,
  anchor: { x: 0, y: 1 },
  offset: { x: -0.05, y: 0.1 },
} as const;

class SettingsPanel {
  readonly el: Container;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(app: Application, onClose: () => void) {
    const cardW = 440;
    const el = new Container();

    const backdrop = new Graphics();
    backdrop.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x000000, alpha: 0.6 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', onClose);
    el.addChild(backdrop);

    const card = new Container();
    const bg = new Graphics();
    const cardH = 294;
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x111111);
    card.addChild(bg);

    // Swallow clicks inside the card so only clicks on the dimmed backdrop
    // close the panel (a click that misses a control must not close it).
    card.eventMode = 'static';
    card.on('pointertap', () => {});

    const title = makeLabel('Settings', { fontSize: 24, fill: 0xffffff, fontWeight: '700' });
    title.position.set(cardW / 2 - title.width / 2, 24);
    card.addChild(title);

    let current = loadSettings().attackConfirmation;
    const apply = (value: boolean): void => {
      current = value;
      setAttackConfirmation(value);
      checkbox.setChecked(value);
    };
    const label = makeLabel('Attack confirmation dialog', { fontSize: 16, fill: 0xeeeeee });
    const checkbox = makeCheckbox(current, apply);
    label.position.set(24, 78 - label.height / 2);
    checkbox.el.position.set(cardW - 24 - 22, 78 - 11);
    // Make the whole row a toggle target, not just the small square.
    label.eventMode = 'static';
    label.cursor = 'pointer';
    label.on('pointertap', () => apply(!current));
    card.addChild(label, checkbox.el);

    const difficultyLabel = makeLabel('AI difficulty', { fontSize: 16, fill: 0xeeeeee });
    const difficultyCurrent = loadSettings().aiDifficulty;
    const difficultyButtons: Button[] = (['easy', 'normal', 'hard'] as AiDifficulty[]).map((d) => {
      const b = new Button({
        label: d[0]!.toUpperCase() + d.slice(1),
        width: 92,
        selected: d === difficultyCurrent,
        onClick: () => {
          setAiDifficulty(d);
          difficultyButtons.forEach((bb) => {
            bb.selected = bb === b;
          });
        },
      });
      return b;
    });
    difficultyLabel.position.set(24, 120 - difficultyLabel.height / 2);
    difficultyButtons.forEach((b, i) => {
      b.position.set(cardW - 24 - difficultyButtons.length * 92 - (difficultyButtons.length - 1) * 4 + i * 96, 120 - b.height / 2);
    });
    card.addChild(difficultyLabel, ...difficultyButtons);

    const tipsLabel = makeLabel('Disable tips', { fontSize: 16, fill: 0xeeeeee });
    let tipsOn = loadSettings().disableTips;
    const applyTips = (value: boolean): void => {
      tipsOn = value;
      setTipsDisabled(value);
      tipsCheckbox.setChecked(value);
    };
    const tipsCheckbox = makeCheckbox(tipsOn, applyTips);
    tipsLabel.position.set(24, 162 - tipsLabel.height / 2);
    tipsCheckbox.el.position.set(cardW - 24 - 22, 162 - 11);
    tipsLabel.eventMode = 'static';
    tipsLabel.cursor = 'pointer';
    tipsLabel.on('pointertap', () => applyTips(!tipsOn));
    card.addChild(tipsLabel, tipsCheckbox.el);

    const close = new Button({ label: 'Close', width: 140, onClick: onClose });
    close.position.set(cardW / 2 - 70, 232);
    card.addChild(close);

    card.position.set(app.screen.width / 2 - cardW / 2, app.screen.height / 2 - cardH / 2);
    el.addChild(card);

    this.el = el;
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.el.destroy({ children: true });
  }
}

export class StartScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private title: Text | null = null;
  private hint: Text | null = null;
  private buttons: Button[] = [];
  private index = 0;
  private aboutBtn: Button | null = null;
  private settingsBtn: Button | null = null;
  private modal: Modal | SettingsPanel | null = null;
  private topImg: Sprite | null = null;
  private bottomImg: Sprite | null = null;
  private bg: Graphics | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.addGradientBackground();
    this.addBackgroundImages();

    this.title = makeLabel('Hex', { fontSize: 64, fill: 0xffffff, fontWeight: '800' });
    this.title.anchor.set(0.5, 0.5);

    const single = new Button({
      label: 'Single player',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('setup'),
    });
    const multi = new Button({
      label: 'Multiplayer',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('lobby'),
    });
    const buttons: Button[] = [single, multi];
    if (saveRepository.hasSave()) {
      buttons.unshift(new Button({ label: 'Resume', width: 240, onClick: () => gameController.resumeGame() }));
    }
    this.buttons = buttons;
    this.buttons[0]!.selected = true;

    this.hint = makeLabel('↑/↓ navigate · Enter select', { fontSize: 12, fill: 0xeeeeee });
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.root.addChild(this.title, ...this.buttons, this.hint);

    this.aboutBtn = new Button({ label: 'About', width: 96, fontSize: 14, onClick: () => this.openModal('about') });
    this.settingsBtn = new Button({ label: 'Settings', width: 110, fontSize: 14, onClick: () => this.openModal('settings') });
    this.root.addChild(this.aboutBtn, this.settingsBtn);

    this.layout();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.layout();

  private addGradientBackground(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    this.root!.addChild(g);
    this.bg = g;
  }

  private paintGradient(): void {
    if (!this.bg || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: h },
      colorStops: [
        { offset: 0, color: 0xff61e7 },
        { offset: 0.58, color: 0x0a2c5a },
        { offset: 1, color: 0x0a2c5a },
      ],
      textureSpace: 'global',
    });
    this.bg.clear().rect(0, 0, w, h).fill(gradient);
  }

  private addBackgroundImages(): void {
    this.topImg = this.loadBackground(MAIN_TOP);
    this.bottomImg = this.loadBackground(MAIN_BOTTOM);
  }

  private loadBackground(def: { file: string; anchor: { x: number; y: number } }): Sprite {
    const sprite = new Sprite();
    sprite.anchor.set(def.anchor.x, def.anchor.y);
    sprite.eventMode = 'none';
    this.root!.addChild(sprite);
    const img = new Image();
    img.onload = () => {
      if (sprite.destroyed) return;
      sprite.texture = Texture.from(img);
      this.layout();
    };
    img.src = IMAGE_BASE + def.file;
    return sprite;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.modal) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.move(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.buttons[this.index]!.trigger();
    }
  };

  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    this.title!.position.set(w / 2, h / 2 - 130);
    let y = h / 2 - 40;
    for (const b of this.buttons) {
      b.position.set(w / 2 - 120, y);
      y += 64;
    }
    this.hint!.position.set(w / 2, y + 6);
    if (this.aboutBtn) this.aboutBtn.position.set(12, h - this.aboutBtn.height - 12);
    if (this.settingsBtn) this.settingsBtn.position.set(w - this.settingsBtn.width - 12, h - this.settingsBtn.height - 12);
    this.paintGradient();
    this.placeBackground(this.topImg, MAIN_TOP);
    this.placeBackground(this.bottomImg, MAIN_BOTTOM);
  }

  private placeBackground(
    sprite: Sprite | null,
    def: { width: number; height: number; anchor: { x: number; y: number }; offset: { x: number; y: number } },
  ): void {
    if (!sprite || sprite.texture === Texture.EMPTY || !this.host) return;
    // Keep the intended on-screen width, but derive the height from the
    // texture's own aspect ratio so a differently-sized image is never
    // distorted.
    const texture = sprite.texture;
    const scale = (def.width * BACKGROUND_SCALE) / texture.width;
    sprite.width = texture.width * scale;
    sprite.height = texture.height * scale;
    // Start with the image's matching corner on the screen corner, then apply
    // the offset, which is a fraction of the image's own width/height.
    const screen = this.host.app.screen;
    sprite.position.set(
      def.anchor.x * screen.width + def.offset.x * def.width,
      def.anchor.y * screen.height + def.offset.y * def.height,
    );
  }

  private move(dir: number): void {
    this.index = (this.index + dir + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => {
      b.selected = i === this.index;
    });
  }

  private openModal(kind: 'about' | 'settings'): void {
    if (this.modal || !this.host) return;
    if (kind === 'settings') {
      this.modal = new SettingsPanel(this.host.app, () => this.closeModal());
      this.modal.el.position.set(0, 0);
      this.root!.addChild(this.modal.el);
      return;
    }
    const opts = kind === 'about'
      ? { title: 'About', lines: [ABOUT_TEXT, 'Author: swypse@gmail.com'] }
      : { title: 'Settings', lines: [] };
    const modal = new Modal({ app: this.host.app, ...opts, onClose: () => this.closeModal() });
    modal.mount(this.root!);
    this.modal = modal;
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.modal.destroy();
    this.modal = null;
  }

  destroy(): void {
    if (this.modal) {
      this.modal.destroy();
      this.modal = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.root?.destroy({ children: true });
    this.root = null;
    this.title = null;
    this.hint = null;
    this.buttons = [];
    this.aboutBtn = null;
    this.settingsBtn = null;
    this.topImg = null;
    this.bottomImg = null;
    this.bg = null;
    this.host = null;
  }
}
