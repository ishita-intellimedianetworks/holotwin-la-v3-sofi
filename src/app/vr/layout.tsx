import type { Metadata } from "next";

/**
 * Carries the VR section's title.
 *
 * Its own layout rather than `metadata` on the page because `./[venue]/page.tsx`
 * overrides this with the venue's own name, and a section title has to exist for
 * a child to override.
 */
export const metadata: Metadata = {
  title: "HoloTwin VR — Immersive Walkthrough",
};

export default function VRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
