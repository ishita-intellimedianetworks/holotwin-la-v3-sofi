"use client";

/**
 * Warm uikit's font atlas. Import for the side effect wherever the VR tree is
 * set up.
 *
 * uikit's `<Text>` lazily imports its font chunk and SUSPENDS until it lands,
 * so without this the first panel pops in a beat after its background.
 *
 * IT IS NOT THE SITE'S TYPEFACE, and cannot be. The overlays are set in Saira
 * and Barlow, which are woff2 files; uikit renders text from a signed-distance
 * atlas and has no path from one to the other without generating an msdf atlas
 * per weight and shipping it. Inter is what it comes with, and at a headset's
 * resolution and reading distance the difference is not what anyone notices.
 */
void import("@pmndrs/msdfonts/inter").catch(() => {
  // Not fatal — uikit retries through its own suspense path.
});
