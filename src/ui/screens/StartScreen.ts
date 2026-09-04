import { Application, Container, FillGradient, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { saveRepository } from '../../storage/saveGame';
import { loadSettings, setAiDifficulty, setAttackConfirmation, setTipsDisabled } from '../../storage/settings';
import { AiDifficulty } from '../../game/aiDifficulty';
import { isTouchDevice } from '../touch';
import { type ScreenController, type UIHost } from '../host';
import { ScreenScroll } from '../verticalScroll';
import { t } from '../../i18n';
import { Button } from '../kit/button';
import { makeCheckbox } from '../kit/checkbox';
import { makeLabel } from '../kit/label';
import { Modal } from '../kit/modal';
import { Popup } from '../kit/popup';
import { setLanguage, type Language } from '../../storage/settings';

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

/** Popup-backed dialog the start screen can show (settings / about). */
interface ModalView {
  destroy(): void;
  hide(onDone: () => void): void;
}

class SettingsPanel {
  readonly el: Container;
  private popup: Popup | null = null;

  constructor(app: Application, onClose: () => void) {
    const close = new Button({ label: t('settings.close'), width: 140, onClick: onClose });
    const popup = new Popup({
      app,
      title: t('settings.title'),
      buttons: [close],
      onClose,
    });
    this.popup = popup;
    this.el = popup.el;

    const content = popup.content;
    const cw = popup.contentWidth;
    const rowH = 30;

    let current = loadSettings().attackConfirmation;
    const apply = (value: boolean): void => {
      current = value;
      setAttackConfirmation(value);
      checkbox.setChecked(value);
    };
    const label = makeLabel(t('settings.attackConfirm'), { fontSize: 14, fill: 0xeeeeee });
    const checkbox = makeCheckbox(current, apply);
    label.position.set(0, (rowH - label.height) / 2);
    checkbox.el.position.set(cw - 22, (rowH - 22) / 2);
    label.eventMode = 'static';
    label.cursor = 'pointer';
    label.on('pointertap', () => apply(!current));
    const row1 = new Container();
    row1.addChild(label, checkbox.el);
    row1.position.set(0, 0);
    content.addChild(row1);

    const difficultyLabel = makeLabel(t('settings.difficulty'), { fontSize: 14, fill: 0xeeeeee });
    difficultyLabel.position.set(0, rowH + 6);
    content.addChild(difficultyLabel);
    const difficultyCurrent = loadSettings().aiDifficulty;
    const difficultyKeys: Record<AiDifficulty, string> = {
      easy: 'difficulty.easy',
      normal: 'difficulty.normal',
      hard: 'difficulty.hard',
    };
    const difficultyButtons: Button[] = (['easy', 'normal', 'hard'] as AiDifficulty[]).map((d, i) => {
      const b = new Button({
        label: t(difficultyKeys[d]),
        width: 76,
        selected: d === difficultyCurrent,
        onClick: () => {
          setAiDifficulty(d);
          difficultyButtons.forEach((bb) => {
            bb.selected = bb === b;
          });
        },
      });
      b.position.set(i * 82, rowH + 6 + difficultyLabel.height + 8);
      return b;
    });
    difficultyButtons.forEach((b) => content.addChild(b));

    let tipsOn = loadSettings().disableTips;
    const applyTips = (value: boolean): void => {
      tipsOn = value;
      setTipsDisabled(value);
      tipsCheckbox.setChecked(value);
    };
    const tipsCheckbox = makeCheckbox(tipsOn, applyTips);
    const tipsLabel = makeLabel(t('settings.disableTips'), { fontSize: 14, fill: 0xeeeeee });
    const tipsY = rowH + 6 + difficultyLabel.height + 8 + 34 + 10;
    tipsLabel.position.set(0, tipsY + (rowH - tipsLabel.height) / 2);
    tipsCheckbox.el.position.set(cw - 22, tipsY + (rowH - 22) / 2);
    tipsLabel.eventMode = 'static';
    tipsLabel.cursor = 'pointer';
    tipsLabel.on('pointertap', () => applyTips(!tipsOn));
    content.addChild(tipsLabel, tipsCheckbox.el);

    // Language row
    const langLabel = makeLabel(t('settings.language'), { fontSize: 14, fill: 0xeeeeee });
    const langY = tipsY + rowH + 8;
    langLabel.position.set(0, langY);
    content.addChild(langLabel);
    const currentLang = loadSettings().lang;
    const pickLang = (code: Language): void => {
      if (code === currentLang) return;
      setLanguage(code);
      window.location.reload();
    };
    const langs: { code: Language; key: string }[] = [
      { code: 'en', key: 'lang.en' },
      { code: 'ru', key: 'lang.ru' },
    ];
    const langButtons: Button[] = langs.map((l, i) => {
      const b = new Button({
        label: t(l.key),
        width: 110,
        selected: l.code === currentLang,
        onClick: () => pickLang(l.code),
      });
      b.position.set(i * 118, langY + langLabel.height + 8);
      return b;
    });
    langButtons.forEach((b) => content.addChild(b));
  }

  mount(container: Container): void {
    container.addChild(this.el);
    this.popup?.finish();
  }

  hide(onDone: () => void): void {
    this.popup?.animateOut(onDone);
  }

  destroy(): void {
    this.popup?.destroy();
    this.popup = null;
  }
}

export class StartScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private scroll: ScreenScroll | null = null;
  private title: Text | null = null;
  private hint: Text | null = null;
  private buttons: Button[] = [];
  private index = 0;
  private aboutBtn: Button | null = null;
  private settingsBtn: Button | null = null;
  private modal: ModalView | null = null;
  private topImg: Sprite | null = null;
  private bottomImg: Sprite | null = null;
  private bg: Graphics | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.addGradientBackground();
    this.addBackgroundImages();
    this.scroll = new ScreenScroll(host.app, this.root);

    this.title = makeLabel(t('start.title'), { fontSize: 64, fill: 0xffffff, fontWeight: '800' });
    this.title.anchor.set(0.5, 0.5);

    const single = new Button({
      label: t('start.single'),
      width: 240,
      onClick: () => useGameStore.getState().setScreen('setup'),
    });
    const multi = new Button({
      label: t('start.multi'),
      width: 240,
      onClick: () => useGameStore.getState().setScreen('lobby'),
    });
    const tutorial = new Button({
      label: t('start.tutorial'),
      width: 240,
      onClick: () => {
        void gameController.startTutorial();
      },
    });
    const buttons: Button[] = [single, multi, tutorial];
    if (saveRepository.hasSave()) {
      buttons.unshift(new Button({ label: t('start.resume'), width: 240, onClick: () => gameController.resumeGame() }));
    }
    this.buttons = buttons;
    this.buttons[0]!.selected = true;

    this.hint = makeLabel(t('start.hint'), { fontSize: 12, fill: 0xeeeeee });
    this.hint.visible = !isTouchDevice();
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.aboutBtn = new Button({ label: t('start.about'), width: 96, fontSize: 14, onClick: () => this.openModal('about') });
    this.settingsBtn = new Button({ label: t('start.settings'), width: 110, fontSize: 14, onClick: () => this.openModal('settings') });
    this.root.addChild(this.aboutBtn, this.settingsBtn);
    if (this.scroll) {
      this.scroll.content.addChild(this.title, ...this.buttons, this.hint);
    } else {
      this.root.addChild(this.title, ...this.buttons, this.hint);
    }

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
    const titleHalf = (this.title?.height ?? 30) / 2;
    const btnH = this.buttons[0]?.height ?? 34;
    const hintH = this.hint?.height ?? 0;
    const showHint = !!this.hint && this.hint.visible;
    const n = this.buttons.length;
    const topPad = 24;
    const bottomPad = 24;
    // Offsets measured from the title glyph's top edge.
    const firstBtnTop = titleHalf + 90;
    const lastBtnTop = firstBtnTop + Math.max(0, n - 1) * 64;
    const hintCenter = lastBtnTop + 70;
    const columnBottom = showHint ? hintCenter + hintH / 2 : lastBtnTop + btnH;
    let glyphTop = (h - columnBottom) / 2;
    glyphTop = Math.max(topPad, Math.min(glyphTop, h - columnBottom - bottomPad));

    this.title!.position.set(w / 2, glyphTop + titleHalf);
    let y = glyphTop + firstBtnTop;
    for (const b of this.buttons) {
      b.position.set(w / 2 - 120, y);
      y += 64;
    }
    if (this.hint) this.hint.position.set(w / 2, glyphTop + hintCenter);
    if (this.aboutBtn) this.aboutBtn.position.set(12, h - this.aboutBtn.height - 12);
    if (this.settingsBtn) this.settingsBtn.position.set(w - this.settingsBtn.width - 12, h - this.settingsBtn.height - 12);
    this.paintGradient();
    this.placeBackground(this.topImg, MAIN_TOP);
    this.placeBackground(this.bottomImg, MAIN_BOTTOM);
    this.scroll?.resize();
    this.scroll?.refresh();
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
      const panel = new SettingsPanel(this.host.app, () => this.closeModal());
      panel.mount(this.root!);
      this.modal = panel;
      return;
    }
    const opts = kind === 'about'
      ? { title: t('start.aboutTitle'), lines: [t('start.aboutText'), t('start.author', { name: 'swypse@gmail.com' })] }
      : { title: t('settings.title'), lines: [] };
    const modal = new Modal({ app: this.host.app, ...opts, onClose: () => this.closeModal() });
    modal.mount(this.root!);
    this.modal = modal;
  }

  private closeModal(): void {
    const modal = this.modal;
    if (!modal) return;
    this.modal = null;
    const done = (): void => modal.destroy();
    modal.hide(done);
  }

  destroy(): void {
    if (this.modal) {
      this.modal.destroy();
      this.modal = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.scroll?.destroy();
    this.scroll = null;
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
