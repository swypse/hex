import { Container, BitmapText, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { TRIBES, type Tribe, tribeById } from '../../game/tribes';
import { type GameMode } from '../../game/game-mode';
import { type AiDifficulty } from '../../game/ai-difficulty';
import { loadSettings } from '../../storage/settings';
import { t } from '../../i18n';
import { isTouchDevice } from '../touch';
import { type ScreenController, type UIHost } from '../host';
import { ScreenScroll } from '../vertical-scroll';
import { Button } from '../kit/button';
import { ButtonGroup } from '../kit/button-group';
import { makeLabel } from '../kit/label';
import { makeTribeOption, type TribeOption } from '../kit/tribe-option';
import { TRIBE_GAP, TRIBE_ROW_STEP, tribeSlots } from '../kit/tribe-layout';
import { TITLE_TO_CONTENT, BLOCK_GAP } from '../kit/screen-layout';
import { THEME } from '../kit/theme';
import { mixColor } from '../../util/color';
import { BG_FADE_MS, makeTribeBackgroundShader, tribeBackgroundTexture, type TribeBackgroundShader } from './tribe-bg-shader';

const ENEMY_OPTIONS = [1, 2, 3, 4, 5, 6];
const MODE_OPTIONS: GameMode[] = ['capture', 'turns30'];
const DIFFICULTY_OPTIONS: AiDifficulty[] = ['easy', 'normal', 'hard'];
const SELECTOR_COUNT = 5;
// Horizontal margin kept clear on each side when laying out the tribe grid.
const SIDE_MARGIN = 24;
const RADIUS = 28;
// Vertical gap between the tribe name labels and the description below them.
const DESC_GAP = 24;

export class SetupScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private scroll: ScreenScroll | null = null;
  private selector = 0;
  private tribe: Tribe = TRIBES[0]!.id;
  private enemies = 3;
  private difficulty: AiDifficulty = loadSettings().aiDifficulty;
  private tribeTitle: BitmapText | null = null;
  private enemiesTitle: BitmapText | null = null;
  private modeTitle: BitmapText | null = null;
  private difficultyTitle: BitmapText | null = null;
  private tribeItems: TribeOption[] = [];
  private tribeDesc: BitmapText | null = null;
  private tribeDescH = 0;
  private enemyGroup: ButtonGroup | null = null;
  private modeGroup: ButtonGroup | null = null;
  private difficultyGroup: ButtonGroup | null = null;
  private startBtn: Button | null = null;
  private backBtn: Button | null = null;
  private hint: BitmapText | null = null;
  private bg: Graphics | null = null;
  private bgShader: TribeBackgroundShader | null = null;
  private bgTweenRemove: (() => void) | null = null;
  private bgColor: number | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);
    this.scroll = new ScreenScroll(host.app, this.root);

    this.paintBackground();

    this.tribeTitle = makeLabel(t('common.chooseTribe'), { fontSize: 16, fill: 0xffffff });
    this.tribeTitle.anchor.set(0.5, 0.5);
    this.enemiesTitle = makeLabel(t('setup.enemies'), { fontSize: 16, fill: 0xffffff });
    this.enemiesTitle.anchor.set(0.5, 0.5);
    this.modeTitle = makeLabel(t('common.mode'), { fontSize: 16, fill: 0xffffff });
    this.modeTitle.anchor.set(0.5, 0.5);
    this.difficultyTitle = makeLabel(t('setup.difficulty'), { fontSize: 16, fill: 0xffffff });
    this.difficultyTitle.anchor.set(0.5, 0.5);

    for (const tr of TRIBES) {
      const opt = makeTribeOption(
        tr.name,
        `${tr.code}-icon.png`,
        () => {
          this.setTribe(tr.id);
          this.refresh();
        },
        tr.id === this.tribe,
        tr.color,
      );
      this.tribeItems.push(opt);
      this.scroll!.content.addChild(opt.el);
    }

    this.enemyGroup = new ButtonGroup({
      items: ENEMY_OPTIONS.map((n) => ({
        label: String(n),
        onClick: () => {
          this.enemies = n;
          this.refresh();
        },
      })),
    });
    this.scroll!.content.addChild(this.enemyGroup);

    this.modeGroup = new ButtonGroup({
      items: MODE_OPTIONS.map((m) => ({
        label: m === 'capture' ? t('mode.capture') : t('mode.turns30'),
        onClick: () => {
          useGameStore.getState().setMode(m);
          this.refresh();
        },
      })),
    });
    this.scroll!.content.addChild(this.modeGroup);

    this.difficultyGroup = new ButtonGroup({
      items: DIFFICULTY_OPTIONS.map((d) => ({
        label: t(d === 'easy' ? 'difficulty.easy' : d === 'normal' ? 'difficulty.normal' : 'difficulty.hard'),
        onClick: () => {
          this.difficulty = d;
          this.refresh();
        },
      })),
    });
    this.scroll!.content.addChild(this.difficultyGroup);

    this.startBtn = new Button({
      label: t('setup.start'),
      fontSize: 24,
      paddingX: 48,
      paddingY: 14,
      onClick: () => gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode, this.difficulty),
    });
    this.hint = makeLabel(t('setup.hint'), { fontSize: 14, fill: 0xeeeeee });
    this.hint.visible = !isTouchDevice();
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.backBtn = new Button({
      label: t('common.back'),
      width: 96,
      fontSize: 14,
      onClick: () => useGameStore.getState().setScreen('start')
    });

    this.scroll!.content.addChild(
      this.tribeTitle,
      this.enemiesTitle,
      this.modeTitle,
      this.difficultyTitle,
      this.startBtn,
      this.backBtn,
      this.hint,
    );
    this.refresh();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.layout();
    // Re-fill the background rect to the new screen size (the shader's vUV
    // gradient adapts automatically).
    this.paintBackground();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const store = useGameStore.getState();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selector = (this.selector - 1 + SELECTOR_COUNT) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selector = (this.selector + 1) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.change(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.change(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selector === SELECTOR_COUNT - 1) {
        useGameStore.getState().setScreen('start');
      } else {
        gameController.startGame(this.tribe, this.enemies, store.mode, this.difficulty);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      useGameStore.getState().setScreen('start');
    }
  };

  /** Sets the selected tribe and cross-fades the screen background to its tint
   *  when it actually changed (no-op when re-selecting the same tribe). */
  private setTribe(id: Tribe): void {
    if (id === this.tribe) return;
    this.tribe = id;
    const color = tribeById(id)?.color ?? THEME.bg;
    if (color !== this.bgColor) this.changeBackground(color);
  }

  /** First background paint: no transition, just draw the current tribe tint. */
  private paintBackground(): void {
    const host = this.host;
    if (!host) return;
    const w = host.app.screen.width;
    const h = host.app.screen.height;
    const color = tribeById(this.tribe)?.color ?? THEME.bg;
    this.bgColor = color;
    const shader = this.bgShader ?? makeTribeBackgroundShader();
    shader.setTop(color);
    this.bgShader = shader;
    const bg = this.bg ?? new Graphics();
    bg.eventMode = 'none';
    bg.context.customShader = shader.shader;
    // A 1×1 white texture fill (textureSpace 'local') makes the batcher emit
    // real UVs across the rect, so the custom fragment's `vUV.y` runs 0→1 down
    // the screen and paints the tribe→bg gradient.
    if (!this.bg) {
      bg.clear().rect(0, 0, w, h).fill({ texture: tribeBackgroundTexture(), textureSpace: 'local' });
      this.bg = bg;
      // Insert behind the scroll pad/content (mount adds it after ScreenScroll).
      this.root!.addChildAt(bg, 0);
    } else {
      this.bg.clear().rect(0, 0, w, h).fill({ texture: tribeBackgroundTexture(), textureSpace: 'local' });
    }
  }

  /** Cross-fades the full-screen background from the current tribe tint to the
   *  new one over `BG_FADE_MS`, animating the shader's `uTopColor` uniform
   *  instead of rebuilding a gradient texture. Driven on the app ticker so the
   *  render gate keeps drawing frames while the tint animates. */
  private changeBackground(color: number): void {
    const host = this.host;
    const shader = this.bgShader;
    if (!shader || !host) return;
    if (this.bgTweenRemove) this.bgTweenRemove();

    const from = this.bgColor ?? color;
    const to = color;
    const start = performance.now();
    const ticker = host.app.ticker;

    shader.setTop(from);
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - start) / BG_FADE_MS);
      const mixed = mixColor(from, to, t);
      shader.setTop(mixed);
      this.bgColor = mixed;
      if (t >= 1) {
        this.bgTweenRemove = null;
        ticker.remove(fn);
      }
    };
    ticker.add(fn);
    this.bgTweenRemove = () => ticker.remove(fn);
  }

  private change(dir: number): void {
    if (this.selector === SELECTOR_COUNT - 1) return;
    if (this.selector === 0) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.setTribe(TRIBES[(i + dir + TRIBES.length) % TRIBES.length]!.id);
    } else if (this.selector === 1) {
      const i = ENEMY_OPTIONS.indexOf(this.enemies);
      this.enemies = ENEMY_OPTIONS[(i + dir + ENEMY_OPTIONS.length) % ENEMY_OPTIONS.length]!;
    } else if (this.selector === 2) {
      const store = useGameStore.getState();
      const i = MODE_OPTIONS.indexOf(store.mode);
      useGameStore.getState().setMode(MODE_OPTIONS[(i + dir + MODE_OPTIONS.length) % MODE_OPTIONS.length]!);
    } else if (this.selector === 3) {
      const i = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
      this.difficulty = DIFFICULTY_OPTIONS[(i + dir + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length]!;
    }
    this.refresh();
  }

  /** Rebuilds the selected-tribe description below the tribe icons, wrapping it
   *  to the available screen width. The block keeps the height of the longest
   *  tribe description so switching tribes never shifts the blocks below. */
  private refreshTribeDesc(w: number): void {
    if (this.tribeDesc) {
      this.scroll!.content.removeChild(this.tribeDesc);
      this.tribeDesc.destroy();
      this.tribeDesc = null;
    }
    const wrapW = Math.max(120, Math.min(720, w - SIDE_MARGIN * 2));
    const opts = {
      fontSize: 16,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: wrapW,
    };
    let maxH = 0;
    for (const tr of TRIBES) {
      const probe = makeLabel(t(`tribe.desc.${tr.code}`), opts);
      maxH = Math.max(maxH, probe.height);
      probe.destroy();
    }
    this.tribeDescH = maxH;
    const info = tribeById(this.tribe);
    if (!info) return;
    const desc = makeLabel(t(`tribe.desc.${info.code}`), opts);
    desc.anchor.set(0.5, 0);
    this.tribeDesc = desc;
    this.scroll!.content.addChild(desc);
  }

  private refresh(): void {
    if (!this.root) return;
    const tribeIndex = TRIBES.findIndex((t) => t.id === this.tribe);
    const enemiesIndex = ENEMY_OPTIONS.indexOf(this.enemies);
    const modeIndex = MODE_OPTIONS.indexOf(useGameStore.getState().mode);
    const difficultyIndex = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
    this.tribeItems.forEach((opt, i) => {
      opt.setSelected(i === tribeIndex);
    });
    this.enemyGroup?.buttons.forEach((b, i) => {
      b.selected = i === enemiesIndex;
    });
    this.modeGroup?.buttons.forEach((b, i) => {
      b.selected = i === modeIndex;
    });
    this.difficultyGroup?.buttons.forEach((b, i) => {
      b.selected = i === difficultyIndex;
    });
    this.backBtn!.selected = this.selector === SELECTOR_COUNT - 1;
    this.tribeTitle!.style.fill = this.selector === 0 ? 0xffffff : 0x888888;
    this.enemiesTitle!.style.fill = this.selector === 1 ? 0xffffff : 0x888888;
    this.modeTitle!.style.fill = this.selector === 2 ? 0xffffff : 0x888888;
    this.difficultyTitle!.style.fill = this.selector === 3 ? 0xffffff : 0x888888;
    this.layout();
  }

  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    const cx = w / 2;
    const titleHalf = this.tribeTitle?.height ? this.tribeTitle.height / 2 : 15;
    const labelH = this.tribeItems[0]?.labelHeight ?? this.tribeItems[0]?.label.height ?? 16;
    const buttonH = this.enemyGroup?.buttonHeight ?? 36;
    const startH = this.startBtn?.height ?? 0;
    const backH = this.backBtn?.height ?? 0;
    const hintH = this.hint?.height ?? 0;

    // Tribe grid is always two rows (top dominates), even on wide screens.
    const grid = tribeSlots(this.tribeItems.length, TRIBE_GAP * 2);

    this.refreshTribeDesc(w);

    // Block height measured from the title's centre to the bottom of its content.
    const tribeDrop = TITLE_TO_CONTENT + RADIUS + (grid.rows - 1) * TRIBE_ROW_STEP + 34 + labelH;
    const buttonDrop = TITLE_TO_CONTENT + buttonH;

    // All y positions below are relative to the tribe title's centre (cy0 = 0).
    const cy0 = 0;
    const tribeContentBottom = cy0 + tribeDrop;
    const descTop = tribeContentBottom + DESC_GAP;
    const descH = this.tribeDescH;
    const cy1 = descTop + descH + BLOCK_GAP + titleHalf;
    const bottomEnemies = cy1 + buttonDrop;
    const cy2 = bottomEnemies + BLOCK_GAP + titleHalf;
    const bottomMode = cy2 + buttonDrop;
    const cy3 = bottomMode + BLOCK_GAP + titleHalf;
    const bottomDifficulty = cy3 + buttonDrop;
    const startTop = bottomDifficulty + 30;
    const backTop = startTop + startH + 16;
    const hintCentre = backTop + backH + 16;
    const glyphTop = cy0 - titleHalf;
    const end = this.hint?.visible ? hintCentre + hintH / 2 : backTop + backH;
    const contentH = end - glyphTop;
    const screenGlyphTop = Math.max(16, Math.min((h - contentH) / 2, h - contentH - 16));
    const y = (rel: number): number => rel - glyphTop + screenGlyphTop;

    this.tribeTitle!.position.set(cx, y(cy0));
    const tribeRow1Centre = TITLE_TO_CONTENT + RADIUS;
    this.tribeItems.forEach((item, i) => {
      const s = grid.slots[i]!;
      item.el.position.set(cx + s.x, y(tribeRow1Centre) + s.y);
    });
    if (this.tribeDesc) this.tribeDesc.position.set(cx, y(descTop));

    this.enemiesTitle!.position.set(cx, y(cy1));
    const enemyTop = y(cy1) + TITLE_TO_CONTENT;
    if (this.enemyGroup) this.enemyGroup.position.set(cx - this.enemyGroup.groupWidth / 2, enemyTop);

    this.modeTitle!.position.set(cx, y(cy2));
    const modeTop = y(cy2) + TITLE_TO_CONTENT;
    if (this.modeGroup) this.modeGroup.position.set(cx - this.modeGroup.groupWidth / 2, modeTop);

    this.difficultyTitle!.position.set(cx, y(cy3));
    const diffTop = y(cy3) + TITLE_TO_CONTENT;
    if (this.difficultyGroup) this.difficultyGroup.position.set(cx - this.difficultyGroup.groupWidth / 2, diffTop);

    this.startBtn!.position.set(cx - this.startBtn!.width / 2, y(startTop));
    this.backBtn!.position.set(cx - this.backBtn!.width / 2, y(backTop));
    if (this.hint) this.hint.position.set(cx, y(hintCentre));
    this.scroll?.resize();
    this.scroll?.refresh();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    if (this.bgTweenRemove) this.bgTweenRemove();
    this.bgTweenRemove = null;
    this.bgShader?.destroy();
    this.bgShader = null;
    this.scroll?.destroy();
    this.scroll = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
    this.tribeItems = [];
    this.tribeDesc?.destroy();
    this.tribeDesc = null;
    this.enemyGroup = null;
    this.modeGroup = null;
    this.difficultyGroup = null;
    this.tribeTitle = null;
    this.enemiesTitle = null;
    this.modeTitle = null;
    this.difficultyTitle = null;
    this.startBtn = null;
    this.backBtn = null;
    this.hint = null;
    this.bg = null;
  }
}
