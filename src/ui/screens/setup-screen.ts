import { gameController } from '@/controller/game-controller';
import { type Tribe, tribeById, TRIBES } from '@/game/tribes';
import { t } from '@/i18n';
import { loadSettings } from '@/storage/settings';
import { setBackInterceptor, useGameStore } from '@/store/game-store';
import { mixColor } from '@/util';
import { AiDifficulty, FontSize, GameMode, Screen, SetupStep, TextStyle } from '@enums';
import { BitmapText, Container, FillGradient, Graphics, RendererType } from 'pixi.js';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
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
// Keyboard rows on the options step: enemies, mode, difficulty, start, back.
const SELECTOR_COUNT = 5;
const START_ROW = 3;
const BACK_ROW = 4;
// Horizontal margin kept clear on each side when laying out the tribe grid.
const SIDE_MARGIN = 24;
const RADIUS = 28;
/** Step 1 grid: 4 tribes per row, wide gaps, large stars and a games line. */
const GRID_COLUMNS = 4;
const GRID_GAP = TRIBE_GAP * 3;
const GRID_ROW_PAD = 20;
/** Vertical margin above and below the tribe icons block. */
const GRID_MARGIN_Y = 24;
/** Extra space above the "Mode" heading. */
const MODE_MARGIN_TOP = 16;
const HERO_EXTRAS = { starSize: 28, nameSize: FontSize.NORMAL } as const;
const GRID_OPTION_EXTRAS = { starSize: 20, showGames: true, nameSize: FontSize.NORMAL } as const;
// Vertical gap between the tribe name labels and the description below them.
const DESC_GAP = 24;

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
  private step: SetupStep = SetupStep.TRIBE;
  private selector = 0;
  /** Non-interactive icon of the chosen tribe on the options step. */
  private hero: TribeOption | null = null;
  private gamesLabel: BitmapText | null = null;
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
  /** Mode selector shown on the tribe step (mirrors `modeGroup`). */
  private tribeModeGroup: ButtonGroup | null = null;
  private tribeModeTitle: BitmapText | null = null;
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
          this.enterOptions();
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
    this.unsubResults = useResultsStore.subscribe((state) => {
      this.refreshTribeStats();
      if (this.step === SetupStep.OPTIONS) this.refresh();
      markDirty();
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

    const makeModeGroup = (): ButtonGroup =>
      new ButtonGroup({
        items: MODE_OPTIONS.map((m) => ({
          label: m === GameMode.CAPTURE ? t('mode.capture') : t('mode.turns30'),
          onClick: () => {
            useGameStore.getState().setMode(m);
            this.refresh();
          },
        })),
      });
    this.modeGroup = makeModeGroup();
    this.tribeModeGroup = makeModeGroup();
    this.tribeModeTitle = makeStyledLabel(t('common.mode'), TextStyle.H2);
    this.tribeModeTitle.anchor.set(0.5, 0.5);
    this.scroll!.content.addChild(this.tribeModeTitle);
    this.scroll!.content.addChild(this.modeGroup, this.tribeModeGroup);

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
    this.hint = makeLabel(t('setup.hint'), { fontSize: FontSize.SMALL, fill: 0xeeeeee });
    this.hint.visible = !isTouchDevice();
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.backBtn = new Button({
      label: t('common.back'),
      width: 96,
      fontSize: FontSize.SMALL,
      onClick: () => this.back(),
    });
    this.gamesLabel = makeLabel('', { fontSize: FontSize.NORMAL, fill: 0xeeeeee });
    this.gamesLabel.anchor.set(0.5, 0.5);

    this.scroll!.content.addChild(
      this.tribeTitle,
      this.enemiesTitle,
      this.modeTitle,
      this.difficultyTitle,
      this.startBtn,
      this.backBtn,
      this.hint,
      this.gamesLabel,
    );
    this.refresh();

    // Browser Back on the options step returns to the tribe step.
    setBackInterceptor(() => this.showTribeStep());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.layout();
    // Re-fill the background rect to the new screen size (the shader's vUV
    // gradient adapts automatically).
    this.paintBackground();
  };

  private enterOptions(): void {
    this.step = SetupStep.OPTIONS;
    this.selector = START_ROW;
    this.refresh();
  }

  /** Leaves the options step; false when already on the tribe step. */
  private showTribeStep(): boolean {
    if (this.step !== SetupStep.OPTIONS || !this.root) return false;
    this.step = SetupStep.TRIBE;
    this.refresh();
    return true;
  }

  private back(): void {
    if (!this.showTribeStep()) {
      useGameStore.getState().setScreen(Screen.START);
    }
  }

  private start(): void {
    gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode, this.difficulty);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const options = this.step === SetupStep.OPTIONS;
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.back();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.change(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.change(1);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !options) {
      e.preventDefault();
      this.cycleMode(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'ArrowUp' && options) {
      e.preventDefault();
      this.selector = (this.selector - 1 + SELECTOR_COUNT) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowDown' && options) {
      e.preventDefault();
      this.selector = (this.selector + 1) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!options) this.enterOptions();
      else if (this.selector === BACK_ROW) this.back();
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
    // Also drops the hero icon when returning to the tribe step.
    this.refreshHero();
    markDirty();
  }

  private change(dir: number): void {
    if (this.step === SetupStep.TRIBE) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.setTribe(TRIBES[(i + dir + TRIBES.length) % TRIBES.length]!.id);
    } else if (this.selector === 0) {
      this.cycleMode(dir);
      return;
    } else if (this.selector === 1) {
      const i = ENEMY_OPTIONS.indexOf(this.enemies);
      this.enemies = ENEMY_OPTIONS[(i + dir + ENEMY_OPTIONS.length) % ENEMY_OPTIONS.length]!;
    } else if (this.selector === 2) {
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

  /** Rebuilds the non-interactive icon of the chosen tribe (options step). */
  private refreshHero(): void {
    if (this.hero) {
      this.hero.el.destroy({ children: true });
      this.hero = null;
    }
    const info = tribeById(this.tribe);
    if (!info || this.step !== SetupStep.OPTIONS) return;
    const mode = useGameStore.getState().mode;
    const results = useResultsStore.getState();
    const best = results.modeBest(info.id, mode);
    const hero = makeTribeOption(info.name, `${info.code}-icon.png`, () => {}, true, info.color, best.games > 0 ? best.maxStars : 0, HERO_EXTRAS);
    hero.el.eventMode = 'none';
    this.hero = hero;
    this.scroll!.content.addChild(hero.el);
    this.gamesLabel!.text = t('setup.games', { n: best.games });
  }

  private refresh(): void {
    if (!this.root) return;
    const options = this.step === SetupStep.OPTIONS;
    const tribeIndex = TRIBES.findIndex((t) => t.id === this.tribe);
    const enemiesIndex = ENEMY_OPTIONS.indexOf(this.enemies);
    const modeIndex = MODE_OPTIONS.indexOf(useGameStore.getState().mode);
    const difficultyIndex = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
    this.tribeItems.forEach((opt, i) => {
      opt.setSelected(i === tribeIndex);
      opt.el.visible = !options;
    });
    this.enemyGroup?.buttons.forEach((b, i) => {
      b.selected = i === enemiesIndex;
    });
    for (const group of [this.modeGroup, this.tribeModeGroup]) {
      group?.buttons.forEach((b, i) => {
        b.selected = i === modeIndex;
      });
    }
    this.difficultyGroup?.buttons.forEach((b, i) => {
      b.selected = i === difficultyIndex;
    });
    this.backBtn!.selected = options && this.selector === BACK_ROW;
    this.startBtn!.selected = options && this.selector === START_ROW;
    this.tribeTitle!.visible = !options;
    for (const el of [this.enemiesTitle, this.modeTitle, this.difficultyTitle, this.enemyGroup, this.modeGroup, this.difficultyGroup, this.startBtn, this.gamesLabel]) {
      if (el) el.visible = options;
    }
    if (this.tribeModeGroup) this.tribeModeGroup.visible = !options;
    if (this.tribeModeTitle) this.tribeModeTitle.visible = !options;
    this.modeTitle!.style.fill = this.selector === 0 ? 0xffffff : 0x888888;
    this.enemiesTitle!.style.fill = this.selector === 1 ? 0xffffff : 0x888888;
    this.difficultyTitle!.style.fill = this.selector === 2 ? 0xffffff : 0x888888;
    this.refreshTribeStats();
    this.layout();
  }

  private layout(): void {
    if (!this.root || !this.host) return;
    if (this.step === SetupStep.TRIBE) this.layoutTribeStep();
    else this.layoutOptionsStep();
    this.scroll?.resize();
    this.scroll?.refresh();
  }

  /** Vertically centres a column of `contentH` and returns the y mapper. */
  private columnTop(contentH: number): number {
    const h = this.host!.app.screen.height;
    return clamp((h - contentH) / 2, 16, Math.max(16, h - contentH - 16));
  }

  private layoutTribeStep(): void {
    const w = this.host!.app.screen.width;
    const cx = w / 2;
    const titleH = this.tribeTitle!.height || 30;
    // Names wrap onto two lines for some tribes: size rows by the tallest.
    const labelH = Math.max(16, ...this.tribeItems.map((o) => o.labelHeight));
    // Distance from a circle's centre to the bottom of its caption block.
    const optionDrop = 34 + labelH;
    const rowStep = optionDrop + RADIUS + GRID_ROW_PAD;
    const grid = tribeSlots(this.tribeItems.length, GRID_GAP, GRID_COLUMNS, rowStep);
    const modeH = this.tribeModeGroup?.buttonHeight ?? 36;
    const modeTitleHalf = (this.tribeModeTitle?.height || 20) / 2;
    const gridTop = TITLE_TO_CONTENT + GRID_MARGIN_Y + RADIUS;
    const gridBottom = gridTop + (grid.rows - 1) * rowStep + optionDrop;
    const modeTitleY = gridBottom + GRID_MARGIN_Y + MODE_MARGIN_TOP + modeTitleHalf;
    const backTop = modeTitleY + TITLE_TO_CONTENT + modeH + BLOCK_GAP + 16;
    const hintCentre = backTop + this.backBtn!.height + 16;
    const hintH = this.hint?.height ?? 0;
    const end = this.hint?.visible ? hintCentre + hintH / 2 : backTop + this.backBtn!.height;
    // Rel y 0 is the title centre; the column starts half a title above it.
    const top = this.columnTop(end + titleH / 2);
    const y = (rel: number): number => rel + titleH / 2 + top;

    this.tribeTitle!.position.set(cx, y(0));
    this.tribeModeTitle?.position.set(cx, y(modeTitleY));
    this.tribeModeGroup?.position.set(cx - this.tribeModeGroup.groupWidth / 2, y(modeTitleY + TITLE_TO_CONTENT));
    this.tribeItems.forEach((item, i) => {
      const s = grid.slots[i]!;
      item.el.position.set(cx + s.x, y(gridTop) + s.y);
    });
    this.backBtn!.position.set(cx - this.backBtn!.width / 2, y(backTop));
    if (this.hint) this.hint.position.set(cx, y(hintCentre));
    if (this.tribeDesc) this.tribeDesc.visible = false;
  }

  private layoutOptionsStep(): void {
    const w = this.host!.app.screen.width;
    const cx = w / 2;
    const titleHalf = this.enemiesTitle?.height ? this.enemiesTitle.height / 2 : 15;
    const labelH = this.hero?.labelHeight ?? 16;
    const buttonH = this.enemyGroup?.buttonHeight ?? 36;
    const startH = this.startBtn?.height ?? 0;
    const backH = this.backBtn?.height ?? 0;
    const hintH = this.hint?.height ?? 0;

    this.refreshTribeDesc(w);

    const buttonDrop = TITLE_TO_CONTENT + buttonH;
    // All y positions are relative to the top of the column (the icon's top edge).
    const heroCentre = RADIUS + 4;
    const heroBottom = heroCentre + 34 + labelH;
    const gamesCentre = heroBottom + 14;
    const descTop = gamesCentre + 8 + DESC_GAP;
    const cy1 = descTop + this.tribeDescH + BLOCK_GAP + titleHalf;
    const cy2 = cy1 + buttonDrop + BLOCK_GAP + titleHalf;
    const cy3 = cy2 + buttonDrop + BLOCK_GAP + titleHalf;
    const startTop = cy3 + buttonDrop + 30;
    const backTop = startTop + startH + 16;
    const hintCentre = backTop + backH + 16;
    const end = this.hint?.visible ? hintCentre + hintH / 2 : backTop + backH;
    const top = this.columnTop(end);
    const y = (rel: number): number => rel + top;

    this.hero?.el.position.set(cx, y(heroCentre));
    this.gamesLabel!.position.set(cx, y(gamesCentre));
    if (this.tribeDesc) {
      this.tribeDesc.visible = true;
      this.tribeDesc.position.set(cx, y(descTop));
    }
    const place = (title: BitmapText | null, group: ButtonGroup | null, cy: number): void => {
      title?.position.set(cx, y(cy));
      group?.position.set(cx - group.groupWidth / 2, y(cy) + TITLE_TO_CONTENT);
    };
    place(this.modeTitle, this.modeGroup, cy1);
    place(this.enemiesTitle, this.enemyGroup, cy2);
    place(this.difficultyTitle, this.difficultyGroup, cy3);
    this.startBtn!.position.set(cx - this.startBtn!.width / 2, y(startTop));
    this.backBtn!.position.set(cx - this.backBtn!.width / 2, y(backTop));
    if (this.hint) this.hint.position.set(cx, y(hintCentre));
  }

  destroy(): void {
    setBackInterceptor(null);
    this.unsubResults?.();
    this.unsubResults = null;
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
    this.hero = null;
    this.gamesLabel = null;
    this.enemyGroup = null;
    this.modeGroup = null;
    this.tribeModeGroup = null;
    this.tribeModeTitle = null;
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
