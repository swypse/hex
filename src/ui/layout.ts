export const TOOLBAR_HEIGHT = 64;
export const TURN_BAR_HEIGHT = 24;
export const TOOLBAR_SIDE_PADDING = 12;
export const SKILLS_BUTTON_SIZE = 48;
export const TURN_BAR_GAP = 6;

/** Top-left of the Skills button, which HudSkills and the tip box both anchor to. */
export function skillsButtonPosition(screenWidth: number, screenHeight: number): { x: number; y: number } {
  return {
    x: screenWidth - TOOLBAR_SIDE_PADDING - SKILLS_BUTTON_SIZE,
    y: screenHeight - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - SKILLS_BUTTON_SIZE,
  };
}
