"use client";

import {
  AccessibilityIcon,
  BedDoubleIcon,
  BusFrontIcon,
  CctvIcon,
  CircleHelpIcon,
  DoorOpenIcon,
  DumbbellIcon,
  EyeIcon,
  HeartPulseIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  NetworkIcon,
  ShieldAlertIcon,
  StoreIcon,
  UsersIcon,
  UtensilsIcon,
} from "@react-three/uikit-lucide";
import type { CategoryIconKey } from "@/components-v5/shared/categories";

/**
 * The 3D site's category glyphs, in uikit.
 *
 * `components-v5/shared/categories.ts` names each category's icon rather than
 * supplying it, so the flat panels resolve the name to `lucide-react` and this
 * resolves the SAME name to `@react-three/uikit-lucide`. One table, the same
 * glyph on both surfaces.
 */
export const CATEGORY_ICON: Record<CategoryIconKey, typeof LayoutGridIcon> = {
  "layout-grid": LayoutGridIcon,
  users: UsersIcon,
  eye: EyeIcon,
  accessibility: AccessibilityIcon,
  megaphone: MegaphoneIcon,
  store: StoreIcon,
  network: NetworkIcon,
  utensils: UtensilsIcon,
  dumbbell: DumbbellIcon,
  "heart-pulse": HeartPulseIcon,
  "bed-double": BedDoubleIcon,
  "door-open": DoorOpenIcon,
  help: CircleHelpIcon,
  "shield-alert": ShieldAlertIcon,
  "bus-front": BusFrontIcon,
  cctv: CctvIcon,
};
