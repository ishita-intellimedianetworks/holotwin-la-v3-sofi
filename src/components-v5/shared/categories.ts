/**
 * What each destination category IS — its title, its unit noun, how its list is
 * segmented. The canonical order lives here too.
 *
 * SPLIT OUT OF `destination-sheet/category-meta.ts` SO VR CAN READ IT WITHOUT
 * `lucide-react`. That file's `icon: LucideIcon` field made the whole table
 * unimportable from inside the Canvas: lucide's icons are React-DOM components,
 * and pulling eighteen of them into the VR chunk to read a label would be
 * eighteen components that can never render there.
 *
 * So the icon is named rather than supplied. `category-meta.ts` maps each name
 * to a lucide component and re-exports the merged table under its old shape, so
 * every flat call site is untouched; VR maps the same names to
 * `@react-three/uikit-lucide`. One table, one order, two icon sets.
 */

import type { DestinationCategory } from "./types";

export type CategoryIconKey =
  | "layout-grid"
  | "users"
  | "eye"
  | "accessibility"
  | "megaphone"
  | "store"
  | "network"
  | "utensils"
  | "dumbbell"
  | "heart-pulse"
  | "bed-double"
  | "door-open"
  | "help"
  | "shield-alert"
  | "bus-front"
  | "cctv";

export interface CategoryInfo {
  key: DestinationCategory;
  /** Title shown in the panel header. */
  label: string;
  /** Short word used on the launcher button. */
  short: string;
  /** Named glyph — resolved to an icon component by whichever view renders it. */
  iconKey: CategoryIconKey;
  /** Subtitle noun, e.g. "12 {unit} · sorted by nearest". */
  unit: string;
  /**
   * Optional segment control above the list. "kind" = fixed Campus Dining /
   * Restaurants split (by `dest.kind`); "sport" = a chip per distinct
   * `dest.sports` entry (multi-select); "option" = single-select tabs, one per
   * distinct `dest.option` (the stadium sub-categories, e.g. Gates / Main
   * Entrance).
   */
  segmentBy?: "kind" | "sport" | "option";
  /**
   * "option" category whose values are NOT real sub-categories, just item types
   * (e.g. Seat View: Lower/Upper/Peristyle). Suppresses the sub-category
   * dropdown and shows every destination in one flat list, while keeping the
   * option-category behaviours (inline "Already here" on arrival).
   */
  flatOptions?: boolean;
  /**
   * Live status notices shown under the sub-category control in the panel's list
   * view (e.g. Safety & Guidance emergency updates). Tone drives the status dot:
   * ok = green, warn = amber, alert = red.
   */
  notices?: { text: string; tone?: "ok" | "warn" | "alert" }[];
}

/** Canonical order + presentation for every destination label. */
export const CATEGORY_INFO: CategoryInfo[] = [
  // ── LA2028 HoloTwin demo categories (memorial / stadium) ────────────────────
  // Lead the rail on those venues; each renders a distinct panel with option
  // sub-category chips. "seating" (Seat View), "accessibility" and "services"
  // (Nearby Services) below are reused as the remaining three demo categories.
  // Order matches the demo spec: Layouts → Crowd Flow → Seat View →
  // Accessibility → Event Updates → Nearby Services → Infra.
  { key: "layouts",      label: "Layouts & Wayfinding",   short: "Layouts",       iconKey: "layout-grid",  unit: "points",  segmentBy: "option" },
  { key: "crowdflow",    label: "Crowd Flow",             short: "Crowd",         iconKey: "users",        unit: "zones",   segmentBy: "option" },
  { key: "seating",      label: "Seat Views",             short: "Seat Views",    iconKey: "eye",          unit: "views",   segmentBy: "option", flatOptions: true },
  { key: "accessibility",label: "Accessibility Planning", short: "Accessibility", iconKey: "accessibility",unit: "points",  segmentBy: "option" },
  // flatOptions: updates read as ONE notice-board list (option = the update's
  // type chip on each card), not sub-category tabs.
  { key: "eventupdates", label: "Event Updates",          short: "Updates",       iconKey: "megaphone",    unit: "updates", segmentBy: "option", flatOptions: true },
  { key: "services",     label: "Nearby Services",        short: "Services",      iconKey: "store",        unit: "places",  segmentBy: "option" },
  { key: "infra",        label: "IT Services",            short: "IT Services",   iconKey: "network",      unit: "systems", segmentBy: "option" },
  {
    key: "restaurants",
    label: "Dining",
    short: "Dining",
    iconKey: "utensils",
    unit: "places",
    segmentBy: "kind",
  },
  {
    key: "practice",
    label: "Practice Areas",
    short: "Practice",
    iconKey: "dumbbell",
    unit: "venues",
    // No list segmentation — the venue's sports show as pills in the directions
    // card, not as filter chips above the list.
  },
  // ── Village categories ──────────────────────────────────────────────────────
  {
    key: "wellness",
    label: "Wellness",
    short: "Wellness",
    iconKey: "heart-pulse",
    unit: "centres",
  },
  {
    key: "hostel",
    label: "Athletes' Hostel",
    short: "Hostel",
    iconKey: "bed-double",
    unit: "locations",
  },
  // ── Stadium categories — each shows sub-category tabs via segmentBy "option" ──
  {
    key: "entrance",
    label: "Entrances",
    short: "Entrances",
    iconKey: "door-open",
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "discovery",
    label: "Help & Info",
    short: "Help",
    iconKey: "help",
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "safety",
    label: "Safety & Guidance",
    short: "Safety",
    iconKey: "shield-alert",
    unit: "points",
    segmentBy: "option",
    notices: [
      { text: "All exits operational · routes clear", tone: "ok" },
      { text: "Evacuation drill 15:00 — east concourse", tone: "warn" },
      { text: "EMS staged at the Medical Station · response under 3 min", tone: "ok" },
    ],
  },
  {
    key: "transit",
    label: "Transit & Parking",
    short: "Transit",
    iconKey: "bus-front",
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "cctv",
    label: "Surveillance",
    short: "Security",
    iconKey: "cctv",
    unit: "points",
    segmentBy: "option",
  },
  // Legacy seat-map route key — unused by the current stadium (kept harmless).
  {
    key: "seatviews",
    label: "Seat Views",
    short: "Seats",
    iconKey: "eye",
    unit: "views",
  },
  {
    key: "transport",
    label: "Bus Stop",
    short: "Bus Stop",
    iconKey: "bus-front",
    unit: "destinations",
  },
];

/** Fixed segment labels for the Dining "kind" split. */
export const DINING_SEGMENTS = [
  { id: "campus", label: "Campus Dining" },
  { id: "restaurant", label: "Restaurants" },
] as const;

export const CATEGORY_INFO_BY_KEY: Record<DestinationCategory, CategoryInfo> =
  Object.fromEntries(CATEGORY_INFO.map((c) => [c.key, c])) as Record<
    DestinationCategory,
    CategoryInfo
  >;
