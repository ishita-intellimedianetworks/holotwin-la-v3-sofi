"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { SITE_LABEL } from "@/components/vr/data";
import { HoloTwinHud } from "@/components-v5/shared/ui/molecules/loading-screen";

/**
 * The gate in front of a VR session: one venue, one download, one button.
 *
 * NO PICKER HERE. It listed all four venues, which meant the first thing the
 * page asked of someone who had come to look at LA 2028 was a decision they
 * had no basis for making — before seeing any of them. The session opens on
 * the default venue instead, and moving between them is a button on the dock
 * (`menus/venues`), available in both views. That also means switching works
 * the same way before and during a session rather than being two different
 * mechanisms.
 *
 * `/vr/<venue>` still opens directly on any one of them, for a link that
 * already knows where it is going.
 *
 * `navigator.xr.isSessionSupported` is the only honest support check.
 * User-agent sniffing gets it wrong in both directions: desktop Chrome with a
 * tethered headset supports immersive-vr, and plenty of mobile browsers claim
 * a capability they do not have.
 */

type XRSupport = "checking" | "supported" | "unsupported";

const HeadsetIcon = () => (
  <svg
    width={32}
    height={32}
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M9.26402604,18 C8.79719433,18.6226198 8.05922695,19 7.26393202,19 L4.5,19 C3.11928813,19 2,17.8807119 2,16.5 L2,9.5 C2,8.27576856 2.8799598,7.25706275 4.04188098,7.04188098 C4.25706275,5.8799598 5.27576856,5 6.5,5 L17.5,5 C18.7242314,5 19.7429373,5.8799598 19.958119,7.04188098 C21.1200402,7.25706275 22,8.27576856 22,9.5 L22,16.5 C22,17.8807119 20.8807119,19 19.5,19 L16.736068,19 C15.940773,19 15.2028057,18.6226198 14.735974,18 L9.26402604,18 Z M9.82576985,17 L14.1742301,17 C13.7685119,16.3807773 13.0746523,16 12.322949,16 L11.677051,16 C10.9253477,16 10.2314881,16.3807773 9.82576985,17 Z M5.08535285,7 L18.9146471,7 C18.7087289,6.41740381 18.1531094,6 17.5,6 L6.5,6 C5.84689059,6 5.29127106,6.41740381 5.08535285,7 Z M8.8027864,16.7763932 C9.34713196,15.6877021 10.4598573,15 11.677051,15 L12.322949,15 C13.5401427,15 14.652868,15.6877021 15.1972136,16.7763932 L15.3944272,17.1708204 C15.6485152,17.6789964 16.1679099,18 16.736068,18 L19.5,18 C20.3284271,18 21,17.3284271 21,16.5 L21,9.5 C21,8.67157288 20.3284271,8 19.5,8 L4.5,8 C3.67157288,8 3,8.67157288 3,9.5 L3,16.5 C3,17.3284271 3.67157288,18 4.5,18 L7.26393202,18 C7.83209011,18 8.35148479,17.6789964 8.60557281,17.1708204 L8.8027864,16.7763932 Z M7.5,15 C6.11928813,15 5,13.8807119 5,12.5 C5,11.1192881 6.11928813,10 7.5,10 C8.88071187,10 10,11.1192881 10,12.5 C10,13.8807119 8.88071187,15 7.5,15 Z M7.5,14 C8.32842712,14 9,13.3284271 9,12.5 C9,11.6715729 8.32842712,11 7.5,11 C6.67157288,11 6,11.6715729 6,12.5 C6,13.3284271 6.67157288,14 7.5,14 Z M16.5,15 C15.1192881,15 14,13.8807119 14,12.5 C14,11.1192881 15.1192881,10 16.5,10 C17.8807119,10 19,11.1192881 19,12.5 C19,13.8807119 17.8807119,15 16.5,15 Z M16.5,14 C17.3284271,14 18,13.3284271 18,12.5 C18,11.6715729 17.3284271,11 16.5,11 C15.6715729,11 15,11.6715729 15,12.5 C15,13.3284271 15.6715729,14 16.5,14 Z" />
  </svg>
);

export function EnterVROverlay({
  onEnter,
  isInVrSession,
  error,
  progress,
}: {
  onEnter: () => void;
  isInVrSession: boolean;
  /** Set when a headset was found but the session still failed to start. */
  error?: string | null;
  /**
   * Download progress for the chosen venue's model and navmesh.
   *
   * THIS REPLACES THE BUTTON, which is the point of it rather than the bar.
   * `enterVR()` succeeds the moment the page loads, so without it you can put
   * the headset on and arrive inside a venue whose model is still coming down
   * the wire — a black void that fills in around you, or does not. Waiting is
   * the honest behaviour, and a bar is what makes waiting legible.
   */
  progress: { percent: number; ready: boolean };
}) {
  /**
   * "No WebXR at all" is knowable on the first render, so it is answered there.
   *
   * The effect below can only ever move us off "checking", never onto it — a
   * browser without `navigator.xr` has nothing to await, and resolving that in
   * an effect would render a "checking" state that was never true and cascade a
   * second render to correct it. This whole tree is `ssr: false`, so `navigator`
   * is always present by the time this runs.
   */
  const [support, setSupport] = useState<XRSupport>(() =>
    navigator.xr?.isSessionSupported ? "checking" : "unsupported",
  );

  useEffect(() => {
    const xr = navigator.xr;
    if (!xr?.isSessionSupported) return;

    let cancelled = false;
    xr.isSessionSupported("immersive-vr")
      .then((ok) => {
        if (!cancelled) setSupport(ok ? "supported" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setSupport("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isInVrSession) return null;

  const downloading = !progress.ready;
  const { percent } = progress;

  return (
    <Fragment>
      {/*
        THE SAME LOADER AS THE 3D SITE, so arriving at /vr looks like arriving
        anywhere else on it. Fed from this gate's own download hook — nothing
        here writes the flat site's progress store. Kept mounted and faded by
        `visible` rather than unmounted, so it goes out with the site's usual
        0.35 s fade instead of vanishing.

        It still REPLACES THE BUTTON: the popup below does not exist until the
        download is done, so there is never an Enter VR to press into a venue
        that is still coming down the wire.
      */}
      <HoloTwinHud
        progress={0}
        visible={downloading}
        // The site label, as /lighting's loader shows it — not the venue.
        unitName={SITE_LABEL}
        percentOverride={percent}
      />

      {!downloading && (
        <Fragment>
          <div className="fixed inset-0 z-[20000] bg-black/85 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[20001] flex items-center justify-center p-6">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.14] bg-[#090b0f] shadow-2xl">
              <div className="flex flex-col items-center gap-6 px-8 py-10 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0a84ff]/15 text-[#2997ff]">
                  <HeadsetIcon />
                </span>

                <div className="flex flex-col items-center gap-2">
                  <span className="font-[family-name:var(--font-saira)] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2997ff]">
                    VR Experience
                  </span>
                  <h1 className="font-[family-name:var(--font-saira)] text-2xl font-semibold leading-tight text-white">
                    {SITE_LABEL}
                  </h1>
                </div>

                {support === "unsupported" ? (
                  /*
                  ONLY THE BUTTON IS GATED ON WEBXR — everything above it is not,
                  and that is the fix for a page that looked broken.

                  The picker and the bar used to be hidden here too, on the
                  reasoning that none of it can be acted on without a headset.
                  The result was that a desktop visitor got a card containing
                  four lines of text and nothing else: no venue list, no
                  progress, no control. The page was working perfectly and
                  looked like it had failed to load — while still quietly
                  pulling a nine-megabyte model in the background with no
                  indication that anything was happening.

                  Only the Enter button is genuinely impossible here. The
                  listing is worth reading on any device, and the download is
                  real whether or not a headset is attached, so both stay and
                  this line takes the button's place rather than the card's
                  contents.
                */
                  <div className="flex w-full flex-col gap-3">
                    <p className="text-sm leading-relaxed text-white/80">
                      Open this page in a VR headset to walk through{" "}
                      {SITE_LABEL} in first person.
                    </p>
                    <Link
                      href="/"
                      className="text-sm font-medium text-[#2997ff] underline-offset-4 hover:underline"
                    >
                      Back to the flat experience
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onEnter}
                    disabled={support === "checking"}
                    className="w-full rounded-xl bg-[#0071e3] px-4 py-3 font-[family-name:var(--font-saira)] text-sm font-semibold text-white transition-colors hover:bg-[#0a84ff] disabled:opacity-50"
                  >
                    Enter VR
                  </button>
                )}

                {!!error && (
                  <p className="text-sm leading-relaxed text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Fragment>
      )}
    </Fragment>
  );
}
