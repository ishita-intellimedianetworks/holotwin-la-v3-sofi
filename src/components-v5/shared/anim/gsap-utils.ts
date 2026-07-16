import gsap from "gsap";

interface FadeOpts   { duration: number; delay: number; ease: string; from: number }
interface SlideOpts  { duration: number; delay: number; ease: string; distance: number }
interface StaggerOpts { duration: number; delay: number; ease: string; stagger: number; distance: number }

export function fadeIn(el: Element, opts?: Partial<FadeOpts>): gsap.core.Tween {
  gsap.killTweensOf(el);
  return gsap.fromTo(el,
    { opacity: opts?.from ?? 0 },
    { opacity: 1, duration: opts?.duration ?? 0.4, delay: opts?.delay ?? 0, ease: opts?.ease ?? "power2.out" },
  );
}

export function fadeOut(el: Element, opts?: Partial<FadeOpts>): gsap.core.Tween {
  gsap.killTweensOf(el);
  return gsap.to(el, {
    opacity: 0,
    duration: opts?.duration ?? 0.4,
    delay:    opts?.delay    ?? 0,
    ease:     opts?.ease     ?? "power2.in",
  });
}

export function slideIn(
  el: Element,
  from: "left" | "right" | "bottom",
  opts?: Partial<SlideOpts>,
): gsap.core.Tween {
  gsap.killTweensOf(el);
  const dist = opts?.distance ?? 20;
  const fromProps =
    from === "left"  ? { x: -dist, opacity: 0 } :
    from === "right" ? { x:  dist, opacity: 0 } :
                       { y:  dist, opacity: 0 };
  return gsap.fromTo(el, fromProps, {
    x: 0, y: 0, opacity: 1,
    duration: opts?.duration ?? 0.4,
    delay:    opts?.delay    ?? 0,
    ease:     opts?.ease     ?? "power3.out",
  });
}

export function staggerIn(
  els: Element[],
  opts?: Partial<StaggerOpts>,
): gsap.core.Timeline {
  const dist = opts?.distance ?? 18;
  return gsap.timeline().fromTo(
    els,
    { opacity: 0, y: dist },
    {
      opacity: 1, y: 0,
      duration: opts?.duration ?? 0.7,
      delay:    opts?.delay    ?? 0,
      ease:     opts?.ease     ?? "power3.out",
      stagger:  opts?.stagger  ?? 0.11,
    },
  );
}
