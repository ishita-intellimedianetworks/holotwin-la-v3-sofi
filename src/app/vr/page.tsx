import VRClient from "@/components/vr/experience/client";

/**
 * `/vr` — the immersive walkthrough of the whole site.
 *
 * A Server Component, so the `ssr: false` import stays in
 * `components/vr/experience/client.tsx`. It takes no parameters: the gate lists
 * every venue and the session can move between them without leaving VR, so this
 * route IS the site rather than a page per building. `/vr/<venue>` exists
 * alongside it for a direct link into one.
 */
export default function VRPage() {
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
      <VRClient />
    </div>
  );
}
