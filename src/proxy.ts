import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Sends a headset straight to `/vr`.
 *
 * The shared link is the site root, which opens the flat experience. On a
 * headset that is the wrong door: the flat site is a mouse-and-screen page,
 * and finding `/vr` from it means typing a URL with a controller. So a root
 * visit from a headset browser is redirected to the immersive walkthrough.
 *
 * DETECTION IS BY USER AGENT, server side, so the headset never downloads the
 * flat scene first. `navigator.xr` cannot be used for this — desktop Chrome
 * exposes it too, with or without a headset attached. Known tokens:
 *
 *   Meta Quest   → "OculusBrowser" (and "Quest" in the device string)
 *   Pico         → "PicoBrowser" / "Pico"
 *   Wolvic       → "Wolvic" (successor to Firefox Reality)
 *   Samsung VR   → "Mobile VR"
 *
 * Apple Vision Pro's Safari reports itself as desktop macOS Safari, so it
 * cannot be told apart here and stays on the flat site.
 *
 * `?flat=1` skips the redirect, for anyone on a headset who wants the flat site.
 */
const HEADSET_UA = /OculusBrowser|\bQuest\b|Pico|Wolvic|Firefox Reality|Mobile VR/i;

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has("flat")) return NextResponse.next();

  const ua = request.headers.get("user-agent") ?? "";
  if (!HEADSET_UA.test(ua)) return NextResponse.next();

  return NextResponse.redirect(new URL("/vr", request.url));
}

export const config = {
  // Only the shared link. `/vr/*` must never match (it would loop), and the
  // admin/tool pages are reached on purpose.
  matcher: "/",
};
