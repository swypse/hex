export const TOOLBAR_HEIGHT = 64;
export const TURN_BAR_HEIGHT = 18;
/** Skills/achievements action buttons match the player score chip size. */
export const SKILLS_BUTTON_SIZE = 40;
export const TURN_BAR_GAP = 6;
export const ACTION_TOOLBAR_MAX_WIDTH = 600;

/** Score chip (top-right) layout constants, shared with HudScore. */
export const SCORE_PAD = 8;
export const SCORE_TOP_OFFSET = 20;
export const SCORE_CHIP_RADIUS = 20;
/** Gap between the chip bottom and the score text below it. */
export const SCORE_TEXT_CHIP_GAP = 6;
/** Height of the score text (font size) below the chip. */
export const SCORE_TEXT_HEIGHT = 16;
/** Gap between the score text bottom and the achievements button. */
export const SCORE_ACHIEVEMENTS_TEXT_GAP = 8;
/** Gap between the achievements button bottom and the first buff icon. */
export const SCORE_BUFF_BUTTON_GAP = 6;
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

/** Top-left of the Achievements button, directly below the player's score text
 *  (centred on the chip's x). Buff icons stack under the button in HudScore. */
export function scoreButtonsPosition(
  screenWidth: number,
  screenHeight: number,
): {
  achievements: { x: number; y: number };
} {
  const chipX = screenWidth - SCORE_PAD - SCORE_CHIP_RADIUS;
  const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
  const textBottom = chipY + SCORE_CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT;
  const x = chipX - SKILLS_BUTTON_SIZE / 2;
  return {
    achievements: { x, y: textBottom + SCORE_ACHIEVEMENTS_TEXT_GAP },
  };
}

/** Top-left of the buff-icon column, below the achievements button. */
export function buffRowPosition(screenWidth: number, screenHeight: number): { x: number; y: number } {
  const chipX = screenWidth - SCORE_PAD - SCORE_CHIP_RADIUS;
  const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
  const textBottom = chipY + SCORE_CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT;
  return {
    x: chipX - SCORE_BUFF_ICON / 2,
    y: textBottom + SCORE_ACHIEVEMENTS_TEXT_GAP + SKILLS_BUTTON_SIZE + SCORE_BUFF_BUTTON_GAP,
  };
}
