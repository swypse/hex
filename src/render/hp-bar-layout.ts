/** Geometry of a unit's hp bar (screen px), shared by everything that stacks
 *  something above it: the hp text, the damage badge, the capture icon. */

/** Outer white box and the 1 px frame around the green/orange fills. */
export const HP_BAR_OUTER_W = 40;
export const HP_BAR_OUTER_H = 7;
export const HP_BAR_PADDING = 1;
export const HP_BAR_HEIGHT = HP_BAR_OUTER_H - 2 * HP_BAR_PADDING;
export const HP_BAR_INNER_W = HP_BAR_OUTER_W - 2 * HP_BAR_PADDING;

/** The box ends 1 px above the bar's anchor, so its top edge is this far above it. */
export const HP_BAR_BOX_TOP = -(HP_BAR_OUTER_H + 1);
/** Gap between the hp text bottom and the box top. */
export const HP_LABEL_GAP = 2;
/** The hp text bottom sits this far above the anchor. */
export const HP_LABEL_UP = -HP_BAR_BOX_TOP + HP_LABEL_GAP;
/** Black plate behind the hp text: side padding and corner radius. */
export const HP_LABEL_PAD_X = 4;
export const HP_LABEL_RADIUS = 2;
/** Gap between neighbouring plates on the hp line (the starvation tag, the bonus icon). */
export const HP_LABEL_PLATE_GAP = 2;
/** Gap between a capture icon's bottom and the box top. */
export const HP_BAR_ICON_GAP = 4;
