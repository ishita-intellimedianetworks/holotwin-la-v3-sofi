/**
 * VR UI design tokens. Every panel reads from here.
 *
 * Sizes are chosen by the ANGLE they subtend, not their pixel value:
 * `angle = 2 · atan(size / (2 · distance))`. At panel distance the type scale
 * lands at roughly 1.0° / 1.25° / 1.8°. Above ~2.5° text reads as signage
 * rather than as an interface.
 */

/** Layout spacing. */
/**
 * THE 3D SITE'S PANEL, SCALED. Every value below is the flat destination
 * panel's own (`components-v5/interior-scene/ui/destination-sheet`) times
 * ~1.6, which is what puts its 15 px card title at the 24-25 px a headset
 * reads at 2 m. Change the ratio, not individual numbers.
 */
export const SPACE = {
  /** `px-5 pt-6` on the flat panel. */
  panelX: 28,
  panelY: 28,
  section: 18,
  /** `gap-2` between cards. */
  row: 12,
  /** The panel already carries the inset; this only clears the scrollbar. */
  listX: 8,
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
  /** `rounded-[14px]`. */
  panel: 22,
  /** `rounded-2xl` — a destination card. */
  card: 26,
  /** `rounded-[14px]` — the Start / Teleport buttons, the subcategory pill. */
  row: 22,
  chip: 14,
  dot: 999,
} as const;

/** The flat panel's type scale × ~1.6. */
export const TEXT = {
  /** 12-12.5 px — the walk-time line, chips, meta. */
  label: 20,
  /** 13-13.5 px — subtitles, prose. */
  body: 22,
  /** 15 px semibold — a card's name. */
  name: 25,
  /** 18 px bold — the panel title. */
  heading: 30,
} as const;

/**
 * The site's own palette, adapted for 3D.
 *
 * THE 3D SITE'S `--nav-*` PALETTE (`app/globals.css`), so a popup in the
 * headset is the same object as the one on the screen: near-black glass
 * `rgba(9,11,15)`, a 14% white hairline, soft-white text, and the blue accent
 * — solid `#0071e3` for fills, bright `#2997ff` for text, rings and markers.
 *
 * The hues carry over exactly; the BLUR cannot. A `backdrop-filter` needs a
 * backdrop to filter, and in a headset the "backdrop" is the room being drawn
 * in the same pass. So the glass is the same colour at a heavier opacity (see
 * `OPACITY`) rather than the site's 0.52 plus a 22 px blur.
 *
 * Row surfaces are SOLID, not white-at-an-opacity: uikit 1.x has no
 * `backgroundOpacity`, and `opacity` cascades into the label. Each one is the
 * site's translucent value pre-blended over the glass, so it lands on the same
 * colour the site shows.
 */
export const COLOR = {
  /** `--nav-glass` base, opaque — the opacity is applied as a separate layer. */
  panel: "#090b0f",
  /** `--nav-border` is this at 14%. */
  border: "#ffffff",
  /** `--nav-text`. */
  text: "#f4f6f8",
  /** `--nav-text-2` — `rgba(255,255,255,0.82)` over the glass. */
  muted: "#d3d4d5",
  /** `--nav-accent` — the site's solid blue for active fills and CTAs. */
  accent: "#0071e3",
  /** `#0a84ff`, the site's hover/selected blue. */
  accentHover: "#0a84ff",
  /** `--nav-accent-bright` — text, rings, markers, the scrollbar. */
  accentBright: "#2997ff",
  /** The site's stop/danger red. */
  danger: "#e8453c",
  dangerHover: "#ff5a50",

  /** `rgba(255,255,255,0.06)` over the glass — a resting row or disc. */
  rowRest: "#17191d",
  /** `hover:bg-white/[0.12]`-ish over the glass. */
  rowHover: "#25272b",
  /** `rgba(10,132,255,0.16)` over the glass — a selected row. */
  rowActive: "#0a1e35",
  /** `--nav-border` over the glass. */
  rowBorder: "#2d2f33",
  rowBorderActive: "#2997ff",

  /** `--nav-text-faint` — `rgba(255,255,255,0.6)` over the glass. Chevrons. */
  faint: "#9d9e9f",
  /** `rgba(255,255,255,0.10)` — a card's leading icon tile, a card on hover. */
  tile: "#1f2124",
  /** `rgba(255,255,255,0.14)` — the header's close disc. */
  closeFill: "#2d2f33",
  closeHover: "#3e4044",
  /** `rgba(41,151,255,0.20)` — the "You're here" card. */
  here: "#0f273f",
} as const;

export const OPACITY = {
  /**
   * The site's glass is 0.52 behind a 22 px blur. With no blur possible here,
   * 0.52 lets a bright stadium straight through the text, so the same colour
   * is held at 0.9.
   */
  panel: 0.9,
  /**
   * The site's hairline is 14%; at headset resolution that vanishes against a
   * bright venue, so it is doubled.
   */
  border: 0.3,
} as const;

/**
 * Minimum comfortable ray target, in degrees of arc. A hand-held ray inherits
 * every tremor in the wrist. Everything pressable is sized against this.
 */
export const MIN_TARGET_DEGREES = 2.5;
