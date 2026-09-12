/**
 * The destination-category table, with a lucide icon attached to each row.
 *
 * THE TABLE ITSELF LIVES IN `shared/categories.ts` — labels, order, units,
 * segmentation, the safety notices. This file does one thing: resolve each
 * row's named glyph to a `lucide-react` component, so the DOM panels keep the
 * `CategoryMeta` shape they have always had.
 *
 * The split exists because VR needs the same table and cannot have lucide:
 * its icons are React-DOM components, useless inside the Canvas, and eighteen
 * of them would ride along in the VR chunk purely to read a label. The VR side
 * maps the same `iconKey` values onto `@react-three/uikit-lucide` instead.
 */

import {
  BusFront,
  Dumbbell,
  Utensils,
  Store,
  Eye,
  Accessibility,
  ShieldAlert,
  HeartPulse,
  BedDouble,
  DoorOpen,
  HelpCircle,
  Cctv,
  LayoutGrid,
  Users,
  Megaphone,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { DestinationCategory } from "@/components-v5/shared/types";
import {
  CATEGORY_INFO,
  type CategoryIconKey,
  type CategoryInfo,
} from "@/components-v5/shared/categories";

export { DINING_SEGMENTS } from "@/components-v5/shared/categories";
export type { CategoryInfo };

/** Named glyph → the lucide component for it. */
const GLYPH: Record<CategoryIconKey, LucideIcon> = {
  "layout-grid": LayoutGrid,
  users: Users,
  eye: Eye,
  accessibility: Accessibility,
  megaphone: Megaphone,
  store: Store,
  network: Network,
  utensils: Utensils,
  dumbbell: Dumbbell,
  "heart-pulse": HeartPulse,
  "bed-double": BedDouble,
  "door-open": DoorOpen,
  help: HelpCircle,
  "shield-alert": ShieldAlert,
  "bus-front": BusFront,
  cctv: Cctv,
};

/** The shared row, plus the resolved icon the DOM panels render. */
export type CategoryMeta = CategoryInfo & { icon: LucideIcon };

/** Canonical order + presentation for every destination label. */
export const DEST_CATEGORIES: CategoryMeta[] = CATEGORY_INFO.map((info) => ({
  ...info,
  icon: GLYPH[info.iconKey],
}));

export const CATEGORY_BY_KEY: Record<DestinationCategory, CategoryMeta> = Object.fromEntries(
  DEST_CATEGORIES.map((c) => [c.key, c]),
) as Record<DestinationCategory, CategoryMeta>;
