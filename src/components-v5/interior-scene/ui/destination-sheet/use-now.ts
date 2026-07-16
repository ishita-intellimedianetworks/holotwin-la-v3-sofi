"use client";

import { useEffect, useState } from "react";

/** Ticking wall-clock (ms). Drives live "next bus in N min" timings without
 *  recomputing on every render. Client-only (the overlay mounts post-canvas). */
export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
