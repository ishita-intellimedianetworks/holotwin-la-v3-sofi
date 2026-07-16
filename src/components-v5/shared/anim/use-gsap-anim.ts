"use client";

import gsap from "gsap";
import { useEffect, useRef, type RefObject } from "react";

export function useGsapAnim<T extends Element>(
  fn: (el: T) => gsap.core.Tween | gsap.core.Timeline,
  deps: unknown[],
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const anim = fn(ref.current);
    return () => { anim.kill(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
