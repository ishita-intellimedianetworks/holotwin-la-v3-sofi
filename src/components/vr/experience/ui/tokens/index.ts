/**
 * VR UI design tokens. Every panel reads from here.
 *
 * Sizes are chosen by the ANGLE they subtend, not their pixel value:
 * `angle = 2 · atan(size / (2 · distance))`. At panel distance the type scale
 * lands at roughly 1.0° / 1.25° / 1.8°. Above ~2.5° text reads as signage
 * rather than as an interface.
 */

/** Layout spacing. */
export const SPACE = {
  panelX: 16,
  panelY: 16,
  section: 16,
  row: 8,
  listX: 16,
  icon: 16,
  rowX: 18,
  primaryX: 32,
  /**
   * Dock inset AND the gap between its buttons — deliberately one value, so the
   * space around every icon is equal, including the first and last.
   */
  dock: 16,
} as const;

/**
 * Pointer priority. Overlapping targets resolve by ORDER FIRST and only then by
 * distance, and uikit never sets one — so everything ties at 0 and the nearest
 * surface wins. Inside a building that is routinely a wall rather than the UI
 * in front of your face, which leaves a panel drawn on top but unclickable.
 *
 * Both values inherit to descendants (`object.pointerEventsOrder ??
 * parentPointerEventsOrder`), so one setting per surface covers its controls.
 */
export const POINTER_ORDER = {
  /** Any UI surface: panels, the dock. Beats the whole scene. */
  ui: 10,
  /**
   * A control that FLOATS on a panel rather than sitting in its flow — the
   * close disc. It overlaps the surface it belongs to, so a tie at `ui` would
   * be settled by distance between two things at the same depth. This is the
   * only reason the value exists; it is not a z-index.
   */
  overlay: 20,
} as const;

/**
 * Fixed, so a list is an even rhythm. 48 px is ~2.75° at panel distance — clear
 * of `MIN_TARGET_DEGREES`, which is the floor this may not cross, since a row is
 * a ray target before it is a line of text.
 */
export const ROW_HEIGHT = 48;

export const RADIUS = {
  panel: 20,
  row: 12,
  chip: 8,
  dot: 999,
} as const;

export const TEXT = {
  label: 18,
  body: 22,
  heading: 32,
} as const;

/**
 * The site's own palette, adapted for 3D.
 *
 * `components-v5/shared/tokens` describes every overlay as glass:
 * `rgba(15,23,42,0.55)` behind a `blur(12px)`, slate text, a cyan accent. The
 * hues carry over exactly; the BLUR cannot. A `backdrop-filter` needs a
 * backdrop to filter, and in a headset the "backdrop" is the room being drawn
 * in the same pass — there is nothing behind the panel to sample. A dark tint
 * plus a bright hairline is what reads as glass instead, so `GlassSurface`
 * stands in for `NAV_GLASS`.
 */
export const COLOR = {
  /** `tokens.glass.bg`, opaque — the opacity is applied as a separate layer. */
  panel: "#0f172a",
  border: "#ffffff",
  text: "#ffffff",
  /** `tokens.color.dim`. */
  muted: "#94a3b8",
  /**
   * FILL colour for the one affirmative button on a panel.
   *
   * NOT the site's `#22d3ee`. That cyan is a stroke and a glow colour — it is
   * used for hairlines, active rails and the wayfinding line — and it is far
   * too light to carry white text: white on it reads 1.9:1, well under the 4.5
   * a label needs. This is the same hue three steps darker, where white reads
   * 5.3:1, so the button matches the site without the one non-white label the
   * bright version would force.
   */
  accent: "#0e7490",
  accentHover: "#0891b2",
  /**
   * For anything THIN — a hairline, a spinner stroke, a scrollbar. This IS the
   * site's accent, used where a bright colour belongs.
   */
  accentBright: "#22d3ee",
  danger: "#e5484d",
  dangerHover: "#f2555a",

  /**
   * Row surfaces are SOLID, not white-at-an-opacity. uikit 1.x has no
   * `backgroundOpacity`, and `opacity` cascades into the label. Solid also
   * guarantees contrast over a venue of any colour — and these range from a
   * night-lit stadium bowl to a white hotel room.
   */
  rowRest: "#16202e",
  rowHover: "#22303f",
  /** The same shift, tinted toward the accent's hue. */
  rowActive: "#0b2b33",
  rowBorder: "#2b3542",
  rowBorderActive: "#22d3ee",
} as const;

export const OPACITY = {
  /** `tokens.glass.bg` is 0.55; a shade heavier here because there is no blur
   *  doing half the work of separating the card from the scene. */
  panel: 0.72,
  /** Far higher than the site's `rgba(255,255,255,0.08)`: at headset resolution
   *  an 8% hairline is not visible at all. */
  border: 0.45,
} as const;

/**
 * Minimum comfortable ray target, in degrees of arc. A hand-held ray inherits
 * every tremor in the wrist. Everything pressable is sized against this.
 */
export const MIN_TARGET_DEGREES = 2.5;
