"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

/**
 * Client boundary for the VR experience.
 *
 * Split from the route so the page can stay a Server Component — `next/dynamic`
 * with `ssr: false` is only allowed inside a Client Component. WebXR is
 * browser-only, so this keeps the whole tree out of the server render rather
 * than guarding in every component.
 */

/**
 * The chunk-loading screen — deliberately NOT a progress bar.
 *
 * THERE IS ONLY ONE BAR IN THIS FLOW, and it lives on the gate. A second one
 * here would mean a user watches a bar run, vanish, and be replaced by a
 * different bar starting again from zero. Two bars for one wait reads as two
 * waits. It also could not be honest: `next/dynamic` reports no progress for a
 * chunk fetch, so the only thing on offer is an animation pretending to measure
 * something.
 *
 * `position: fixed`, NOT `absolute`. This is the screen a user stares at for
 * the whole first load, and `absolute` measures itself against the nearest
 * positioned ancestor — which makes it depend on something outside this file
 * having a height. When that ancestor collapsed to zero this screen collapsed
 * with it, and the entire first load was a blank black page with no sign that
 * anything was happening. `fixed` is measured against the viewport, so it
 * cannot be sized out of existence by its container.
 *
 * Inline styles, not Tailwind: this renders before the VR bundle and its css
 * have arrived, so it cannot depend on anything the bundle brings with it.
 */
function VRBootScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "black",
        fontFamily: "var(--font-saira), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/*
          A spinner, because the wordmark alone is indistinguishable from a page
          that has finished loading and has nothing on it. The chunk is several
          megabytes of three, uikit and xr; on a cold dev compile the wait runs
          to tens of seconds, and something has to be moving during it.

          Keyframes are injected here rather than added to globals.css for the
          same reason the styles are inline: this screen must not depend on any
          stylesheet the bundle it is waiting for might bring with it.
        */}
        <style>{"@keyframes vr-boot-spin{to{transform:rotate(360deg)}}"}</style>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.15)",
            borderTopColor: "#22d3ee",
            animation: "vr-boot-spin 0.8s linear infinite",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          VR Experience
        </span>
      </div>
    </div>
  );
}

/**
 * Catches anything the VR tree throws on the way up.
 *
 * WITHOUT THIS, EVERY FAILURE LOOKS IDENTICAL: React unmounts the whole tree on
 * an uncaught render error, so a missing WebGL context, a three/uikit version
 * mismatch and a chunk that failed to download all produce exactly the same
 * blank black page — and so did a zero-height wrapper, which is what actually
 * went wrong first. That ambiguity is the real cost; the screen is secondary.
 *
 * A class component because that is still the only way to implement
 * `componentDidCatch`. It is deliberately not a retry button: a failed WebGL
 * context or a bad bundle will fail again the same way, and a button that
 * reliably does nothing is worse than none.
 */
class VRErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error ? error.message : "Unknown error starting VR.",
    };
  }

  componentDidCatch(error: unknown) {
    // The console is where anyone debugging this will look first, and the
    // rendered message below is deliberately short.
    console.error("[VR] failed to start", error);
  }

  render() {
    if (this.state.message == null) return this.props.children;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "black",
          padding: 24,
          fontFamily: "var(--font-barlow), system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", color: "white" }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            The VR experience could not start.
          </p>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.55)",
              wordBreak: "break-word",
            }}
          >
            {this.state.message}
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: 20,
              fontSize: 13,
              fontWeight: 500,
              color: "#22d3ee",
            }}
          >
            Back to the flat experience
          </Link>
        </div>
      </div>
    );
  }
}

const VRExperience = dynamic(() => import("./index"), {
  ssr: false,
  loading: VRBootScreen,
});

export default function VRClient({ venueId }: { venueId?: string }) {
  return (
    <VRErrorBoundary>
      <VRExperience venueId={venueId} />
    </VRErrorBoundary>
  );
}
