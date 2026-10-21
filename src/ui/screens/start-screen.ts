import { Application, Container, FillGradient, Graphics, Sprite, BitmapText, Texture } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { saveRepository } from '../../storage/save-game';
import { activeMatchStore } from '../../storage/active-match';
import { loadSettings, setAiDifficulty, setSoundEnabled, welcomeDismissed, setWelcomeDismissed } from '../../storage/settings';
import { isTouchDevice } from '../kit/touch';
import { MenuStars } from '../../gfx/menu-stars';
import { KeyHints, placeKeyHints } from '../kit/key-hints';
import { markDirty } from '../../gfx/render-gate';
import { type ScreenController, type UIHost } from '../host';
import { ScreenScroll } from '../kit/vertical-scroll';
import { TiltLogo } from '../kit/tilt-logo';

/** Logo display size: the 194x170 hex-terra.png at its native size. Layout
 *  reserves it statically so the menu column never jumps when the logo image
 *  finishes loading (the sprite's height is 0 until then). */
const TITLE_WIDTH = 194;
const TITLE_HEIGHT = 170;
const TITLE_HALF = TITLE_HEIGHT / 2;
/** Menu column: row width, row gap and how far below the logo the first row sits. */
const MENU_WIDTH = 300;
const ROW_GAP = 6;
const MENU_TOP_GAP = 40;
const ROW_PAD_Y = 10;
const ROW_PAD_X = 20;
/** Below this width the column is centred instead of hugging the left. */
const COMPACT_WIDTH = 640;
const DIVIDER_GAP = 18;
const FOOTER_GAP = 14;
import { t } from '../../i18n';
import { Button } from '../kit/button';
import { ButtonGroup } from '../kit/button-group';
import { makeLabel } from '../../gfx/label';
import { makeSwitch } from '../kit/switch';
import { Modal } from '../kit/modal';
import { Popup } from '../kit/popup';
import { setLanguage } from '../../storage/settings';
import { ensureCanvasResource } from '../../gfx/image-texture';
import { useAuthStore } from '../../auth/auth-store';
import { AiDifficulty, AuthStatus, AuthStep, ButtonStyle, FontSize, Language, Screen, StartModal } from '@enums';
import { AuthBar } from '../auth-bar';
import { AuthDialog } from '../overlays/auth-dialog';
import { clamp } from '../../util/math';

/** Popup-backed dialog the start screen can show (settings / about). */
interface ModalView {
  destroy(): void;

  hide(onDone: () => void): void;
}

/** Shared options of the main-menu rows. */
const MENU_ROW = {
  style: ButtonStyle.MENU,
  width: MENU_WIDTH,
  paddingX: ROW_PAD_X,
  paddingY: ROW_PAD_Y,
} as const;

class SettingsPanel {
  readonly el: Container;
  private popup: Popup | null = null;

  constructor(app: Application, onClose: () => void) {
    const close = new Button({ label: t('common.close'), width: 140, onClick: onClose });
    const popup = new Popup({
      app,
      title: t('settings.title'),
      buttons: [close],
      onClose,
    });
    this.popup = popup;
    this.el = popup.el;

    const content = popup.content;
    const blockGap = 22;
    let y = 0;

    const difficultyLabel = makeLabel(t('settings.difficulty'), { fontSize: FontSize.SMALL, fill: 0xeeeeee });
    difficultyLabel.position.set(0, y);
    content.addChild(difficultyLabel);
    y += difficultyLabel.height + 8;

    const difficultyOptions: AiDifficulty[] = [AiDifficulty.EASY, AiDifficulty.NORMAL, AiDifficulty.HARD];
    const difficultyKeys: Record<AiDifficulty, string> = {
      easy: 'difficulty.easy',
      normal: 'difficulty.normal',
      hard: 'difficulty.hard',
    };
    const difficultyGroup = new ButtonGroup({
      items: difficultyOptions.map((d) => ({
        label: t(difficultyKeys[d]),
        onClick: () => {
          setAiDifficulty(d);
          difficultyGroup.buttons.forEach((b, i) => {
            b.selected = difficultyOptions[i] === d;
          });
        },
      })),
    });
    const currentDifficulty = loadSettings().aiDifficulty;
    difficultyGroup.buttons.forEach((b, i) => {
      b.selected = difficultyOptions[i] === currentDifficulty;
    });
    difficultyGroup.position.set(0, y);
    content.addChild(difficultyGroup);
    y += difficultyGroup.buttonHeight + blockGap;

    const soundSwitch = makeSwitch(loadSettings().soundOn, (on) => setSoundEnabled(on), { label: t('settings.sound') });
    soundSwitch.el.position.set(0, y);
    content.addChild(soundSwitch.el);
    y += soundSwitch.el.height + blockGap;

    const langLabel = makeLabel(t('settings.language'), { fontSize: FontSize.SMALL, fill: 0xeeeeee });
    langLabel.position.set(0, y);
    content.addChild(langLabel);
    y += langLabel.height + 8;

    const langOptions: { code: Language; key: string }[] = [
      { code: Language.EN, key: 'lang.en' },
      { code: Language.RU, key: 'lang.ru' },
    ];
    const currentLang = loadSettings().lang;
    const langGroup = new ButtonGroup({
      items: langOptions.map((l) => ({
        label: t(l.key),
        onClick: () => {
          if (l.code === currentLang) return;
          setLanguage(l.code);
          window.location.reload();
        },
      })),
    });
    langGroup.buttons.forEach((b, i) => {
      b.selected = langOptions[i]!.code === currentLang;
    });
    langGroup.position.set(0, y);
    content.addChild(langGroup);
    y += langGroup.buttonHeight + blockGap;

    const welcomeSwitch = makeSwitch(welcomeDismissed(), (checked) => setWelcomeDismissed(checked), { label: t('settings.dontShowWelcome') });
    welcomeSwitch.el.position.set(0, y);
    content.addChild(welcomeSwitch.el);
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
  /** Holder positioned by layout; the tilting logo is added once the image loads. */
  private title: Container | null = null;
  private tilt: TiltLogo | null = null;
  private hints: KeyHints | null = null;
  private divider: Graphics | null = null;
  private stars: MenuStars | null = null;
  private buttons: Button[] = [];
  private index = 0;
  private aboutBtn: Button | null = null;
  private settingsBtn: Button | null = null;
  private authBar: AuthBar | null = null;
  /** Buttons blocked until the auth API answers. */
  private gated: Button[] = [];
  private unsubscribeAuth: (() => void) | null = null;
  private modal: ModalView | null = null;
  private bg: Graphics | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.addGradientBackground();
    this.stars = new MenuStars(host.app, this.root);
    this.scroll = new ScreenScroll(host.app, this.root);

    this.title = new Container();
    const img = new Image();
    img.onload = () => {
      if (!this.title || this.title.destroyed) return;
      const texture = Texture.from(img);
      ensureCanvasResource(texture);
      this.tilt = new TiltLogo(texture, TITLE_WIDTH, Math.round(TITLE_WIDTH * img.naturalHeight / img.naturalWidth));
      this.title.addChild(this.tilt);
      this.layout();
      // Async visual change outside any store/interaction: request a frame so
      // the logo appears without a pointer event.
      markDirty();
    };
    img.src = `${import.meta.env.BASE_URL}textures/hex-terra.png`;

    interface Row {
      label: string;
      onClick: () => void;
      /** Blocked until the auth API answers. */
      gated: boolean;
    }
    const rows: Row[] = [
      { label: t('start.single'), gated: true, onClick: () => useGameStore.getState().setScreen(Screen.SETUP) },
      { label: t('start.multi'), gated: true, onClick: () => useGameStore.getState().setScreen(Screen.LOBBY) },
      { label: t('start.tutorial'), gated: false, onClick: () => void gameController.startTutorial() },
    ];
    if (saveRepository.hasSave()) {
      rows.unshift({ label: t('start.resume'), gated: true, onClick: () => gameController.resumeGame() });
    }
    // A reloaded client re-enters the running match (freshly saved match only).
    if (activeMatchStore.loadFresh()) {
      rows.unshift({ label: t('start.rejoinMatch'), gated: true, onClick: () => gameController.rejoinGame() });
    }
    this.buttons = rows.map((r) => new Button({ ...MENU_ROW, label: r.label, onClick: r.onClick }));
    this.gated = this.buttons.filter((_, i) => rows[i]!.gated);
    this.applyAuthGate();
    this.unsubscribeAuth = useAuthStore.subscribe(() => this.applyAuthGate());
    this.buttons[0]!.selected = true;

    this.divider = new Graphics();
    this.hints = new KeyHints([
      { key: '↑↓', label: t('common.keySelect') },
      { key: 'Enter', label: t('common.keyConfirm') },
    ]);
    this.hints.visible = !isTouchDevice();

    this.aboutBtn = new Button({
      label: t('start.about'),
      style: ButtonStyle.TEXT,
      fontSize: FontSize.SMALL,
      onClick: () => this.openModal(StartModal.ABOUT)
    });
    this.settingsBtn = new Button({
      label: t('start.settings'),
      style: ButtonStyle.TEXT,
      fontSize: FontSize.SMALL,
      onClick: () => this.openModal(StartModal.SETTINGS)
    });
    this.authBar = new AuthBar(
      () => this.openModal(StartModal.LOGIN),
      () => this.openModal(StartModal.REGISTER),
      () => this.layout(),
    );
    this.root.addChild(this.authBar, this.hints);
    const column = this.scroll?.content ?? this.root;
    column.addChild(this.title, ...this.buttons, this.divider, this.settingsBtn, this.aboutBtn);

    this.layout();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
    host.app.ticker.add(this.onTick);
  }

  private applyAuthGate(): void {
    const busy = useAuthStore.getState().status === AuthStatus.UNKNOWN;
    for (const b of this.gated) b.disabled = busy;
    markDirty();
  }

  private onResize = (): void => this.layout();

  /** Tilts the logo towards the pointer, relative to the logo centre. */
  private onPointerMove = (e: PointerEvent): void => {
    const logo = this.title;
    const screen = this.host?.app.screen;
    if (!logo || !screen) return;
    this.tilt?.setPointer((e.clientX - logo.x) / (screen.width / 2), (e.clientY - logo.y) / (screen.height / 2));
    markDirty();
  };

  private onTick = (): void => {
    if (this.tilt?.update()) markDirty();
  };

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
        { offset: 0, color: 0x1b1147 },
        { offset: 0.6, color: 0x0b1a42 },
        { offset: 1, color: 0x06122e },
      ],
      textureSpace: 'global',
    });
    this.bg.clear().rect(0, 0, w, h).fill(gradient);
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
    const compact = w < COMPACT_WIDTH;
    const colW = Math.min(MENU_WIDTH, w - 32);
    const colX = compact ? (w - colW) / 2 : Math.max(40, w * 0.1);
    const hintsH = this.hints?.visible ? this.hints.height + 24 : 0;

    // Column offsets from the logo's top edge.
    const firstRowTop = TITLE_HEIGHT + MENU_TOP_GAP;
    const rowsHeight = this.buttons.reduce((sum, b) => sum + b.boxHeight + ROW_GAP, 0);
    const dividerTop = firstRowTop + rowsHeight + DIVIDER_GAP - ROW_GAP;
    const footerTop = dividerTop + FOOTER_GAP;
    const footerH = Math.max(this.settingsBtn?.boxHeight ?? 0, this.aboutBtn?.boxHeight ?? 0);
    const columnBottom = footerTop + footerH;
    const topPad = 56;
    const free = h - hintsH;
    const glyphTop = Math.max(topPad, (free - columnBottom) / 2);

    this.title!.position.set(colX + TITLE_WIDTH / 2, glyphTop + TITLE_HALF);
    let y = glyphTop + firstRowTop;
    for (const b of this.buttons) {
      b.position.set(colX, y);
      y += b.boxHeight + ROW_GAP;
    }
    this.divider?.clear().rect(0, 0, colW, 1).fill({ color: 0xffffff, alpha: 0.25 });
    this.divider?.position.set(colX, glyphTop + dividerTop);
    this.settingsBtn?.position.set(colX, glyphTop + footerTop);
    this.aboutBtn?.position.set(colX + (this.settingsBtn?.width ?? 0) + 20, glyphTop + footerTop);
    if (this.hints) placeKeyHints(this.hints, w, h);
    if (this.authBar) this.authBar.position.set(w - this.authBar.width - 16, 14);
    this.paintGradient();
    this.scroll?.resize();
    this.scroll?.refresh();
  }

  private move(dir: number): void {
    this.index = (this.index + dir + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => {
      b.selected = i === this.index;
    });
  }

  private openModal(kind: StartModal): void {
    if (this.modal || !this.host) return;
    if (kind === StartModal.SETTINGS) {
      const panel = new SettingsPanel(this.host.app, () => this.closeModal());
      panel.mount(this.root!);
      this.modal = panel;
      return;
    }
    if (kind === StartModal.LOGIN || kind === StartModal.REGISTER) {
      const step = kind === StartModal.LOGIN ? AuthStep.LOGIN : AuthStep.REGISTER;
      const dialog = new AuthDialog(this.host.app, step, () => this.closeModal());
      dialog.mount(this.root!);
      this.modal = dialog;
      return;
    }
    const opts = kind === StartModal.ABOUT
      ? { title: t('start.aboutTitle'), lines: [t('start.aboutText'), t('start.author', { name: 'swypse' })] }
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
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.host?.app.ticker.remove(this.onTick);
    this.stars?.destroy();
    this.stars = null;
    this.scroll?.destroy();
    this.scroll = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.title = null;
    this.tilt = null;
    this.hints = null;
    this.divider = null;
    this.buttons = [];
    this.gated = [];
    this.aboutBtn = null;
    this.settingsBtn = null;
    this.authBar = null;
    this.bg = null;
    this.host = null;
  }
}
