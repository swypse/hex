import { gameController } from '@/controller/game-controller';
import { type Tribe, tribeById, TRIBES } from '@/game/tribes';
import { t } from '@/i18n';
import { loadSettings } from '@/storage/settings';
import { useGameStore } from '@/store/game-store';
import { mixColor } from '@/util';
import { AiDifficulty, ButtonStyle, FontSize, GameMode, Screen, TextStyle } from '@enums';
import { BitmapText, Container, FillGradient, Graphics, RendererType } from 'pixi.js';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { KeyHints, placeKeyHints } from '../kit/key-hints';
import { MenuStars } from '../../gfx/menu-stars';
import { ButtonGroup } from '../kit/button-group';
import { makeLabel } from '../../gfx/label';
import { makeStyledLabel } from '../../gfx/text-styles';
import { BLOCK_GAP, TITLE_TO_CONTENT } from '../kit/screen-layout';
import { THEME } from '../../gfx/theme';
import { TRIBE_GAP, tribeSlots } from '../kit/tribe-layout';
import { makeTribeOption, type TribeOption } from '../kit/tribe-option';
import { useResultsStore } from '../../results/results-store';
import { markDirty } from '../../gfx/render-gate';
import { isTouchDevice } from '../kit/touch';
import { ScreenScroll } from '../kit/vertical-scroll';
import {
  BG_FADE_MS, makeTribeBackgroundShader, TRIBE_BG_DEPTH, type TribeBackgroundShader, tribeBackgroundTexture
} from './tribe-bg-shader';
import { clamp } from '../../util/math';

const ENEMY_OPTIONS = [1, 2, 3, 4, 5, 6];
const MODE_OPTIONS: GameMode[] = [GameMode.CAPTURE, GameMode.TURNS30];
const DIFFICULTY_OPTIONS: AiDifficulty[] = [AiDifficulty.EASY, AiDifficulty.NORMAL, AiDifficulty.HARD];
// Keyboard rows: tribe, mode, enemies, difficulty, start, back.
const SELECTOR_COUNT = 6;
const TRIBE_ROW = 0;
const MODE_ROW = 1;
const ENEMIES_ROW = 2;
const DIFFICULTY_ROW = 3;
const START_ROW = 4;
const BACK_ROW = 5;
// Horizontal margin kept clear on each side when laying out the tribe grid.
const SIDE_MARGIN = 24;
const RADIUS = 28;
/** Tribe grid: 4 tribes per row, wide gaps, large stars and a games line. */
const GRID_COLUMNS = 4;
const GRID_GAP = TRIBE_GAP * 3;
const GRID_ROW_PAD = 20;
/** Vertical margin above and below the tribe icons block. */
const GRID_MARGIN_Y = 24;
const GRID_OPTION_EXTRAS = { starSize: 20, showGames: true, nameSize: FontSize.NORMAL } as const;
// Vertical gap between the tribe grid and the description below it.
const DESC_GAP = 8;

/** A vertical tribe-color (top) → screen-bg (bottom) gradient that matches the
 *  WebGL shader in tribe-bg-shader.ts. FillGradient's local-space coordinates
 *  are normalized to the shape (0-1), so ending at `TRIBE_BG_DEPTH` puts the
 *  full blend in the top `TRIBE_BG_DEPTH` of the screen and clamps to solid bg
 *  below — the same curve as the shader's `t = clamp(vUV.y / depth, 0.0, 1.0)`.
 *  Pixi's native gradient fill runs on any backend, so the WebGPU renderer
 *  (which cannot run the WebGL-only custom shader) paints an identical
 *  background through it. */
function tribeGradientFill(topColor: number): FillGradient {
  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: TRIBE_BG_DEPTH },
    textureSpace: 'local',
  });
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, THEME.bg);
  return gradient;
}

export class SetupScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private scroll: ScreenScroll | null = null;
  private selector = START_ROW;
  private tribe: Tribe = TRIBES[0]!.id;
  private enemies = 3;
  private difficulty: AiDifficulty = loadSettings().aiDifficulty;
  private tribeTitle: BitmapText | null = null;
  private enemiesTitle: BitmapText | null = null;
  private modeTitle: BitmapText | null = null;
  private difficultyTitle: BitmapText | null = null;
  private tribeItems: TribeOption[] = [];
  private unsubResults: (() => void) | null = null;
  private tribeDesc: BitmapText | null = null;
  private tribeDescH = 0;
  private enemyGroup: ButtonGroup | null = null;
  private modeGroup: ButtonGroup | null = null;
  private difficultyGroup: ButtonGroup | null = null;
  private startBtn: Button | null = null;
  private backBtn: Button | null = null;
  private hints: KeyHints | null = null;
  private stars: MenuStars | null = null;
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
    // Stars sit above the gradient (child 0) and below the scroll pad and content.
    this.stars = new MenuStars(host.app, this.root, 1);

    this.tribeTitle = makeStyledLabel(t('common.chooseTribe'), TextStyle.H1);
    this.tribeTitle.anchor.set(0.5, 0.5);
    this.enemiesTitle = makeLabel(t('setup.enemies'), { fontSize: FontSize.NORMAL, fill: 0xffffff });
    this.enemiesTitle.anchor.set(0.5, 0.5);
    this.modeTitle = makeLabel(t('common.mode'), { fontSize: FontSize.NORMAL, fill: 0xffffff });
    this.modeTitle.anchor.set(0.5, 0.5);
    this.difficultyTitle = makeLabel(t('setup.difficulty'), { fontSize: FontSize.NORMAL, fill: 0xffffff });
    this.difficultyTitle.anchor.set(0.5, 0.5);

    for (const tr of TRIBES) {
      const opt = makeTribeOption(
        tr.name,
        `${tr.code}-icon.png`,
        () => {
          this.setTribe(tr.id);
          this.selector = TRIBE_ROW;
          this.refresh();
        },
        tr.id === this.tribe,
        tr.color,
        useResultsStore.getState().starsFor(tr.id, useGameStore.getState().mode) ?? 0,
        GRID_OPTION_EXTRAS,
      );
      opt.setGames(useResultsStore.getState().gamesFor(tr.id, useGameStore.getState().mode));
      this.tribeItems.push(opt);
      this.scroll!.content.addChild(opt.el);
    }

    // Bests may arrive after the screen opened (session restore, login).
    this.unsubResults = useResultsStore.subscribe(() => {
      this.refreshTribeStats();
    });

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
        label: m === GameMode.CAPTURE ? t('mode.capture') : t('mode.turns30'),
        onClick: () => {
          useGameStore.getState().setMode(m);
          this.refresh();
        },
      })),
    });
    this.scroll!.content.addChild(this.modeGroup);

    this.difficultyGroup = new ButtonGroup({
      items: DIFFICULTY_OPTIONS.map((d) => ({
        label: t(d === AiDifficulty.EASY ? 'difficulty.easy' : d === AiDifficulty.NORMAL ? 'difficulty.normal' : 'difficulty.hard'),
        onClick: () => {
          this.difficulty = d;
          this.refresh();
        },
      })),
    });
    this.scroll!.content.addChild(this.difficultyGroup);

    this.startBtn = new Button({
      label: t('setup.start'),
      fontSize: FontSize.BIG,
      paddingX: 48,
      paddingY: 14,
      onClick: () => this.start(),
    });
    this.hints = new KeyHints([
      { key: '↑↓', label: t('common.keySelect') },
      { key: '←→', label: t('common.keyChange') },
      { key: 'Enter', label: t('common.keyConfirm') },
      { key: 'Backspace', label: t('common.keyBack') },
    ]);
    this.hints.visible = !isTouchDevice();
    this.root.addChild(this.hints);

    this.backBtn = new Button({
      label: t('common.back'),
      style: ButtonStyle.TEXT,
      fontSize: FontSize.SMALL,
      onClick: () => this.back(),
    });

    this.scroll!.content.addChild(
      this.tribeTitle,
      this.enemiesTitle,
      this.modeTitle,
      this.difficultyTitle,
      this.startBtn,
      this.backBtn,
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

  private back(): void {
    useGameStore.getState().setScreen(Screen.START);
  }

  private start(): void {
    gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode, this.difficulty);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.back();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.change(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.selector = (this.selector + (e.key === 'ArrowUp' ? -1 : 1) + SELECTOR_COUNT) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selector === BACK_ROW) this.back();
      else this.start();
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
    // The tribe-gradient shader is WebGL-only; on WebGPU, painting a Graphics
    // with a GL-only customShader throws in the renderer (`shader.gpuProgram`
    // is undefined), so WebGPU draws a native gradient fill instead.
    const webGPU = host.app.renderer?.type === RendererType.WEBGPU;
    if (!webGPU) {
      const shader = this.bgShader ?? makeTribeBackgroundShader();
      shader.setTop(color);
      this.bgShader = shader;
    }
    const bg = this.bg ?? new Graphics();
    bg.eventMode = 'none';
    if (!webGPU) bg.context.customShader = this.bgShader!.shader;
    if (!this.bg) {
      if (webGPU) {
        bg.clear().rect(0, 0, w, h).fill(tribeGradientFill(color));
      } else {
        // A 1×1 white texture fill (textureSpace 'local') makes the batcher emit
        // real UVs across the rect, so the custom fragment's `vUV.y` runs 0→1
        // down the screen and paints the tribe→bg gradient.
        bg.clear().rect(0, 0, w, h).fill({ texture: tribeBackgroundTexture(), textureSpace: 'local' });
      }
      this.bg = bg;
      // Insert behind the scroll pad/content (mount adds it after ScreenScroll).
      this.root!.addChildAt(bg, 0);
    } else if (webGPU) {
      this.bg.clear().rect(0, 0, w, h).fill(tribeGradientFill(color));
    } else {
      this.bg.clear().rect(0, 0, w, h).fill({ texture: tribeBackgroundTexture(), textureSpace: 'local' });
    }
  }

  /** Cross-fades the full-screen background from the current tribe tint to the
   *  new one over `BG_FADE_MS`. WebGL animates the shader's `uTopColor` uniform
   *  in place; WebGPU rebuilds a small native gradient fill each tick (the fade
   *  is short, and the gradient texture is a tiny canvas). Driven on the app
   *  ticker so the render gate keeps drawing frames while the tint animates. */
  private changeBackground(color: number): void {
    const host = this.host;
    if (!host) return;
    if (this.bgTweenRemove) this.bgTweenRemove();

    const webGPU = host.app.renderer?.type === RendererType.WEBGPU;
    const shader = webGPU ? null : this.bgShader;
    if (webGPU && !this.bg) return;
    if (!webGPU && !shader) return;

    const from = this.bgColor ?? color;
    const to = color;
    const start = performance.now();
    const ticker = host.app.ticker;

    shader?.setTop(from);
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - start) / BG_FADE_MS);
      const mixed = mixColor(from, to, t);
      this.bgColor = mixed;
      if (webGPU) {
        const h = host.app.screen.height;
        const w = host.app.screen.width;
        this.bg?.clear().rect(0, 0, w, h).fill(tribeGradientFill(mixed));
      } else {
        shader!.setTop(mixed);
      }
      if (t >= 1) {
        this.bgTweenRemove = null;
        ticker.remove(fn);
      }
    };
    ticker.add(fn);
    this.bgTweenRemove = () => ticker.remove(fn);
  }

  private cycleMode(dir: number): void {
    const i = MODE_OPTIONS.indexOf(useGameStore.getState().mode);
    useGameStore.getState().setMode(MODE_OPTIONS[(i + dir + MODE_OPTIONS.length) % MODE_OPTIONS.length]!);
    this.refresh();
  }

  /** Stars and games of every tribe in the selected mode. */
  private refreshTribeStats(): void {
    const results = useResultsStore.getState();
    const mode = useGameStore.getState().mode;
    TRIBES.forEach((tr, i) => {
      // Unplayed tribes show empty stars.
      this.tribeItems[i]?.setStars(results.starsFor(tr.id, mode) ?? 0);
      this.tribeItems[i]?.setGames(results.gamesFor(tr.id, mode));
    });
    markDirty();
  }

  private change(dir: number): void {
    if (this.selector === TRIBE_ROW) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.setTribe(TRIBES[(i + dir + TRIBES.length) % TRIBES.length]!.id);
    } else if (this.selector === MODE_ROW) {
      this.cycleMode(dir);
      return;
    } else if (this.selector === ENEMIES_ROW) {
      const i = ENEMY_OPTIONS.indexOf(this.enemies);
      this.enemies = ENEMY_OPTIONS[(i + dir + ENEMY_OPTIONS.length) % ENEMY_OPTIONS.length]!;
    } else if (this.selector === DIFFICULTY_ROW) {
      const i = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
      this.difficulty = DIFFICULTY_OPTIONS[(i + dir + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length]!;
    } else {
      return;
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
    const wrapW = clamp(w - SIDE_MARGIN * 2, 120, 720);
    const opts = {
      fontSize: FontSize.NORMAL,
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
    this.tribeItems.forEach((opt, i) => opt.setSelected(i === tribeIndex));
    this.enemyGroup?.buttons.forEach((b, i) => {
      b.selected = i === enemiesIndex;
    });
    this.modeGroup?.buttons.forEach((b, i) => {
      b.selected = i === modeIndex;
    });
    this.difficultyGroup?.buttons.forEach((b, i) => {
      b.selected = i === difficultyIndex;
    });
    this.backBtn!.selected = this.selector === BACK_ROW;
    this.startBtn!.selected = this.selector === START_ROW;
    this.modeTitle!.style.fill = this.selector === MODE_ROW ? 0xffffff : 0x888888;
    this.enemiesTitle!.style.fill = this.selector === ENEMIES_ROW ? 0xffffff : 0x888888;
    this.difficultyTitle!.style.fill = this.selector === DIFFICULTY_ROW ? 0xffffff : 0x888888;
    this.refreshTribeStats();
    this.layout();
  }

  private layout(): void {
    if (!this.root || !this.host) return;
    this.layoutContent();
    if (this.hints) {
      const { width, height } = this.host.app.screen;
      placeKeyHints(this.hints, width, height);
      this.hints.x = (width - this.hints.width) / 2;
    }
    this.scroll?.resize();
    this.scroll?.refresh();
  }

  /** Vertically centres a column of `contentH` and returns the y mapper. */
  private columnTop(contentH: number): number {
    const h = this.host!.app.screen.height;
    return clamp((h - contentH) / 2, 16, Math.max(16, h - contentH - 16));
  }

  private layoutContent(): void {
    const w = this.host!.app.screen.width;
    const cx = w / 2;
    const titleH = this.tribeTitle!.height || 30;
    const titleHalf = (this.enemiesTitle?.height || 30) / 2;
    // Names wrap onto two lines for some tribes: size rows by the tallest.
    const labelH = Math.max(16, ...this.tribeItems.map((o) => o.labelHeight));
    // Distance from a circle's centre to the bottom of its caption block.
    const optionDrop = 34 + labelH;
    const rowStep = optionDrop + RADIUS + GRID_ROW_PAD;
    const grid = tribeSlots(this.tribeItems.length, GRID_GAP, GRID_COLUMNS, rowStep);
    const buttonH = this.enemyGroup?.buttonHeight ?? 36;
    const startH = this.startBtn?.height ?? 0;
    const backH = this.backBtn?.boxHeight ?? 0;

    this.refreshTribeDesc(w);

    const buttonDrop = TITLE_TO_CONTENT + buttonH;
    // All y positions are relative to the title centre.
    const gridTop = TITLE_TO_CONTENT + GRID_MARGIN_Y + RADIUS;
    const gridBottom = gridTop + (grid.rows - 1) * rowStep + optionDrop;
    const descTop = gridBottom + DESC_GAP;
    const cy1 = descTop + this.tribeDescH + BLOCK_GAP + titleHalf;
    const cy2 = cy1 + buttonDrop + BLOCK_GAP + titleHalf;
    const cy3 = cy2 + buttonDrop + BLOCK_GAP + titleHalf;
    const startTop = cy3 + buttonDrop + 30;
    const backTop = startTop + startH + 16;
    const end = backTop + backH;
    // The column starts half a title above the title centre.
    const top = this.columnTop(end + titleH / 2);
    const y = (rel: number): number => rel + titleH / 2 + top;

    this.tribeTitle!.position.set(cx, y(0));
    this.tribeItems.forEach((item, i) => {
      const s = grid.slots[i]!;
      item.el.position.set(cx + s.x, y(gridTop) + s.y);
    });
    this.tribeDesc?.position.set(cx, y(descTop));
    const place = (title: BitmapText | null, group: ButtonGroup | null, cy: number): void => {
      title?.position.set(cx, y(cy));
      group?.position.set(cx - group.groupWidth / 2, y(cy) + TITLE_TO_CONTENT);
    };
    place(this.modeTitle, this.modeGroup, cy1);
    place(this.enemiesTitle, this.enemyGroup, cy2);
    place(this.difficultyTitle, this.difficultyGroup, cy3);
    this.startBtn!.position.set(cx - this.startBtn!.width / 2, y(startTop));
    this.backBtn!.position.set(cx - this.backBtn!.boxWidth / 2, y(backTop));
  }

  destroy(): void {
    this.unsubResults?.();
    this.unsubResults = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    if (this.bgTweenRemove) this.bgTweenRemove();
    this.bgTweenRemove = null;
    this.bgShader?.destroy();
    this.bgShader = null;
    this.stars?.destroy();
    this.stars = null;
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
    this.hints = null;
    this.bg = null;
  }
}
