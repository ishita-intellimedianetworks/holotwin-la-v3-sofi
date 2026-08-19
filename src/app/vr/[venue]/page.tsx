import { notFound } from "next/navigation";
import VRClient from "@/components/vr/experience/client";
import { SITE_LABEL, VENUES, findVenue } from "@/components/vr/data";

/**
 * `/vr/<venue>` — the same experience, opened on one venue.
 *
 * This is a DEEP LINK, not a separate experience: everything `/vr` can do is
 * still here, including moving to another venue from inside the session. All
 * the segment decides is which one the gate is pointing at when you arrive, so
 * a headset can be sent straight to the stadium without anyone tapping through
 * a picker with it on their face.
 */

/** Four venues, known at build time, so all four routes are static. */
export function generateStaticParams() {
  return VENUES.map((venue) => ({ venue: venue.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue: id } = await params;
  const venue = findVenue(id);
  return {
    title: venue ? `${venue.title} — VR` : `${SITE_LABEL} — VR`,
  };
}

export default async function VRVenuePage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue: id } = await params;

  // A hand-typed slug, or a venue that `data` filtered out for having no
  // navmesh. Falling back to the default would silently open the wrong place.
  if (!findVenue(id)) notFound();

  return (
    // `fixed inset-0`, NOT `absolute h-full w-full`.
    //
    // Nothing in this project sets a height on `html` or `body` — verified
    // across globals.css and components-v5/styles.css — so `h-full`
    // (`height: 100%`) resolves against an auto-height body and collapses to
    // ZERO. The wrapper then has no box, and everything inside it that is
    // positioned against a parent (the dynamic import's loading screen) has no
    // box either: the route renders, mounts and downloads correctly while
    // showing an entirely blank page.
    //
    // `fixed` is measured against the viewport instead, so this cannot depend
    // on what happens to be above it in the tree.
    <div className="fixed inset-0 bg-black">
      <VRClient venueId={id} />
    </div>
  );
}
