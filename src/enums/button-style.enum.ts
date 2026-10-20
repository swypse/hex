/** Visual style of a kit `Button`. */
export enum ButtonStyle {
  /** Filled panel with shadow. */
  SOLID = 'solid',
  /** Bare label: no background or shadow; the text stays white in every state. */
  TEXT = 'text',
  /** Main-menu row: left-aligned label on a transparent row; the active row gets a highlight, an accent bar and a nudge right. */
  MENU = 'menu',
  /** Popup footer, primary action: flat accent-filled rounded button, no shadow. */
  POPUP = 'popup',
  /** Popup footer, secondary action: flat outlined rounded button, no shadow. */
  POPUP_OUTLINE = 'popup-outline',
  /** Positive action (accept, confirm): flat green rounded button, no shadow. */
  SUCCESS = 'success',
  /** Negative or cautionary action (decline, discard): flat amber rounded button, no shadow. */
  WARNING = 'warning',
  /** One segment of a `ButtonGroup`: transparent; the selected one is a raised accent pill on the group's track. */
  SEGMENT = 'segment',
}
