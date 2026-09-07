export const TOOLBAR_HEIGHT = 64;
export const TURN_BAR_HEIGHT = 24;
export const TURN_BAR_COLOR = 0x5198ff;
export const TOOLBAR_SIDE_PADDING = 12;
export const SKILLS_BUTTON_SIZE = 48;
export const HUD_BUTTON_GAP = 6;
export const TURN_BAR_GAP = 6;
export const ACTION_TOOLBAR_MAX_WIDTH = 600;

/** Wide screens get a centered, capped-width bottom bar and a full-height map. */
export function isWideScreen(width: number): boolean {
  return width > ACTION_TOOLBAR_MAX_WIDTH;
}

/** Top-left of the Skills button, aligned to the right edge of the centered
 *  action toolbar (full screen width on narrow screens). */
export function skillsButtonPosition(screenWidth: number, screenHeight: number): { x: number; y: number } {
  const barRight = isWideScreen(screenWidth) ? (screenWidth + ACTION_TOOLBAR_MAX_WIDTH) / 2 : screenWidth;
  return {
    x: barRight - TOOLBAR_SIDE_PADDING - SKILLS_BUTTON_SIZE,
    y: screenHeight - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - SKILLS_BUTTON_SIZE,
  };
}

/** Top-left of the Achievements button, left of the Skills button. */
export function achievementsButtonPosition(screenWidth: number, screenHeight: number): { x: number; y: number } {
  const p = skillsButtonPosition(screenWidth, screenHeight);
  return {
    x: p.x - SKILLS_BUTTON_SIZE - HUD_BUTTON_GAP,
    y: p.y,
  };
}
