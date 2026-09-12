/**
 * Sub-category label → which glyph to draw beside it.
 *
 * LIFTED OUT OF `subcategory-rail.tsx`, which is a `createPortal`-to-`<body>`
 * dropdown and therefore unimportable from inside the Canvas. The rules and
 * their order are unchanged.
 *
 * IT RETURNS A KEY, NOT AN ICON. The original handed back a `LucideIcon`
 * component; the flat rail still renders exactly those, but VR draws from
 * `@react-three/uikit-lucide` instead, and a React-DOM component type is no use
 * to it. Both sides now map the same key to their own icon set, so a label can
 * never pick up two different glyphs in the two views.
 *
 * Sub-categories carry no per-option config anywhere in `scenes.json` — the
 * glyph is inferred from the authored label and nothing else. FIRST MATCH WINS,
 * so the order below is the rule: /gate/ sits above /zone|concourse/ because
 * "Level 1 Gates" is a gate, and /vip|premium/ sits at the bottom because
 * "VIP Seating" should read as seating first.
 */

export type IconKey =
  | "door-open"
  | "log-out"
  | "eye"
  | "layout-grid"
  | "trees"
  | "utensils"
  | "store"
  | "bus-front"
  | "square-parking"
  | "accessibility"
  | "cross"
  | "info"
  | "help"
  | "shield-alert"
  | "cctv"
  | "wifi"
  | "key-round"
  | "route"
  | "star"
  | "map-pin";

const ICON_RULES: [RegExp, IconKey][] = [
  [/entrance|entry/i, "door-open"],
  [/gate/i, "door-open"],
  [/exit|emergency|egress/i, "log-out"],
  [/seat|vip|bowl|tier/i, "eye"],
  [/zone|concourse|layout|area/i, "layout-grid"],
  [/surround|plaza|park|outdoor/i, "trees"],
  [/food|concession|dining/i, "utensils"],
  [/merch|store|retail|shop/i, "store"],
  [/transit|bus|shuttle|rideshare|drop/i, "bus-front"],
  [/parking/i, "square-parking"],
  [/access/i, "accessibility"],
  [/medical|first aid|health/i, "cross"],
  [/information|info/i, "info"],
  [/assist|help|lost/i, "help"],
  [/security|incident|safety|checkpoint|restricted/i, "shield-alert"],
  [/cctv|camera|command|surveillance/i, "cctv"],
  [/wifi|network|it |infrastructure/i, "wifi"],
  [/credential|control|scan/i, "key-round"],
  [/scenario|route|drill|evac/i, "route"],
  [/vip|premium/i, "star"],
];

/** Falls back to a location pin — every sub-category gets a glyph. */
export function iconKeyFor(label: string): IconKey {
  for (const [re, key] of ICON_RULES) if (re.test(label)) return key;
  return "map-pin";
}
