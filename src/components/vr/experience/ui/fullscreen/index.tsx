"use client";

import type { ComponentProps } from "react";
import { useCallback } from "react";
import { Fullscreen, VanillaFullscreen } from "@react-three/uikit";

/**
 * uikit's `Fullscreen`, with the teardown race that crashes the canvas closed.
 *
 * THE CRASH: "fullscreen can only be added to a camera", thrown from
 * `Fullscreen.update` when a panel is opened or closed.
 *
 * WHY IT HAPPENS. uikit portals a `Fullscreen` into an `Object3D` it parents to
 * the camera, and drives it from the frame loop through a subscription set up
 * in a `useEffect`. React tears those two down in different phases: R3F
 * detaches the object during the commit, and the effect that unsubscribes the
 * frame callback runs later, in the passive phase. Any frame that lands in
 * between calls `update` on a root that is no longer under the camera — and
 * `update` walks two parents up looking for one and THROWS when it cannot find
 * it, rather than treating a detached root as nothing to do.
 *
 * The gap is normally narrower than a frame. What widens it is a long frame,
 * and these venues produce plenty: the stadium is the biggest model on the site
 * and every panel open or close mounts or unmounts one of these roots.
 *
 * THE FIX is the two lines uikit is missing: a detached root has nothing to
 * update, so skip the frame instead of throwing. Patched per instance rather
 * than on the prototype, so this changes the behaviour of OUR panels and
 * nothing else in the process.
 *
 * A REAL misuse — a `Fullscreen` mounted under something that is not a camera —
 * still throws, because that leaves both parents in place and never reaches the
 * guard. This only ever swallows the frames where the answer is "it is going
 * away".
 *
 * Remove once upstream guards `Fullscreen.update`; as of @pmndrs/uikit 1.0.75
 * it does not.
 */

const guarded = new WeakSet<VanillaFullscreen>();

function guardDetachedUpdates(node: VanillaFullscreen | null) {
  if (node == null || guarded.has(node)) return;
  guarded.add(node);

  const update = node.update.bind(node);
  node.update = (delta: number) => {
    /**
     * `parent` is uikit's own wrapper object and ITS parent is the camera —
     * the exact chain `update` searches. Either link missing means React has
     * already pulled this root out of the graph and the frame callback is just
     * outliving it by a tick.
     */
    if (node.parent?.parent == null) return;
    update(delta);
  };
}

export function VRFullscreen(props: ComponentProps<typeof Fullscreen>) {
  // Stable, so uikit is not handed a new ref every render.
  const ref = useCallback((node: VanillaFullscreen | null) => {
    guardDetachedUpdates(node);
  }, []);

  return <Fullscreen ref={ref} {...props} />;
}
