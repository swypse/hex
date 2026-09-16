export const THEME = {
  bg: 0x1a1a2e,
  button: 0x4b516f,
  buttonHover: 0x5297FF,
  buttonPressed: 0x3977D8,
  buttonSelected: 0x5297FF,
  panelBg: 0x000000,
  panelAlpha: 0.6,
  dialogBg: 0x222222,
  highlight: 0xffd700,
  radius: 4,
  fontFamily: 'Roboto, system-ui, sans-serif',
  text: 0xeeeeee,
  white: 0xffffff,
  skillTree: {
    bg: 0x1a1a2e,
    openedLabelText: 0xffffff,
    closedLabelText: 0x444444,
    openedSkillBg: 0x373748,
    openedSkillStroke: 0xff8c00,
    closedSkillBg: 0x373748,
    closedSkillStroke: 0x333333,
  }
} as const;

export const TEXT_BUTTON = {
  fontSize: 16,
  paddingX: 16,
  paddingY: 8,
  minHeight: 34,
} as const;

export function parseHexColor(css: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(css);
  return m ? parseInt(m[1]!, 16) : THEME.bg;
}

export function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function isLightColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
