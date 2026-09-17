export const TOOLBAR_HEIGHT = 64;
export const TURN_BAR_HEIGHT = 18;
export const TURN_BAR_COLOR = 0x5198ff;
/** Skills/achievements action buttons match the player score chip size. */
export const SKILLS_BUTTON_SIZE = 40;
const HUD_BUTTON_GAP = 6;
export const TURN_BAR_GAP = 6;
export const ACTION_TOOLBAR_MAX_WIDTH = 600;

/** Score chip (top-right) layout constants, shared with HudScore. */
export const SCORE_PAD = 8;
export const SCORE_TOP_OFFSET = 20;
export const SCORE_CHIP_RADIUS = 20;
/** Gap between the chip bottom and the first buff icon below it. */
export const SCORE_BUFF_CHIP_GAP = 6;
/** Gap between the last buff icon and the first action button. */
export const SCORE_BUTTON_GAP = 6;
/** Size of each temple-buff icon under the score chip. */
const SCORE_BUFF_ICON = 16;
/** Vertical gap between stacked buff icons. */
const SCORE_BUFF_GAP = 8;

/** Skills/achievements button translucent black fill. */
export const SCORE_ACTION_BG = { color: 0x000000, alpha: 0.2 };
export const SCORE_ACTION_BG_ACTIVE = { color: 0x000000, alpha: 0.4 };

/** Wide screens get a centered, capped-width bottom bar and a full-height map. */
export function isWideScreen(width: number): boolean {
  return width > ACTION_TOOLBAR_MAX_WIDTH;
}

/** Top-left of the Skills button, below the player's score chip column. The
 *  buttons stack in a column under the score chip (and any buff icons), centred
 *  on the chip's x. */
export function scoreButtonsPosition(
  screenWidth: number,
  screenHeight: number,
  buffCount: number,
): {
  skills: { x: number; y: number };
  achievements: { x: number; y: number };
} {
  const chipX = screenWidth - SCORE_PAD - SCORE_CHIP_RADIUS;
  const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
  const buffHeight = buffCount > 0 ? buffCount * SCORE_BUFF_ICON + (buffCount - 1) * SCORE_BUFF_GAP : 0;
  const skillsTop = chipY + SCORE_CHIP_RADIUS + SCORE_BUFF_CHIP_GAP + buffHeight + SCORE_BUTTON_GAP;
  const x = chipX - SKILLS_BUTTON_SIZE / 2;
  return {
    skills: { x, y: skillsTop },
    achievements: { x, y: skillsTop + SKILLS_BUTTON_SIZE + HUD_BUTTON_GAP },
  };
}
