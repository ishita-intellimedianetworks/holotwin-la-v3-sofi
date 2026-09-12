/**
 * What KIND of notice an event update is, from the text it was filed under.
 *
 * LIFTED OUT OF `info-overlay.tsx` so both the DOM overlay and the VR panel can
 * classify a notice the same way. The rules and the colours are unchanged.
 *
 * IT RETURNS A KEY, NOT AN ICON, and that is the whole reason this file exists.
 * The original returned a `LucideIcon` component, which is a React-DOM element
 * type — importable in the flat app and useless inside the Canvas, where an
 * icon has to come from `@react-three/uikit-lucide` instead. A string key lets
 * each side map to its own icon set from the same classification, so the two
 * can never disagree about which notice is a closure.
 */

export type NoticeKindKey =
  | "closure"
  | "security"
  | "schedule"
  | "restriction"
  | "event"
  | "default";

/**
 * `Destination.option` → kind + colour, so each notice reads at a glance
 * instead of every card carrying the same red dot. FIRST KEYWORD MATCH WINS, so
 * order matters here: /clos/ has to be tested before the broader /event/ or
 * "Session Closures" would come out as an event.
 */
const NOTICE_KINDS: [RegExp, { key: NoticeKindKey; color: string }][] = [
  [/clos/i, { key: "closure", color: "#ffd60a" }],
  [/security|checkpoint/i, { key: "security", color: "#2997FF" }],
  [/schedule|time/i, { key: "schedule", color: "#BF5AF2" }],
  [/restrict/i, { key: "restriction", color: "#FF453A" }],
  [/event|session|ceremon|medal/i, { key: "event", color: "#30D158" }],
];

/**
 * Classify a notice. `fallback` is the caller's own accent — a notice that
 * matches nothing gets the surrounding panel's colour rather than a colour of
 * its own, so an unclassified card reads as ordinary rather than as a category
 * the palette does not explain.
 */
export function noticeKind(
  option: string | undefined,
  fallback: string,
): { key: NoticeKindKey; color: string } {
  for (const [re, kind] of NOTICE_KINDS) {
    if (option && re.test(option)) return kind;
  }
  return { key: "default", color: fallback };
}

/**
 * Event Updates are always "today's" notices: the panel header carries the
 * CURRENT date and each notice a posted-at time. The time is pseudo-random —
 * hashed from the notice id so it's stable across re-renders (no shuffling) but
 * reads like a live feed. Range 08:00–19:59.
 */
export function postedAtTime(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const mins = 8 * 60 + (Math.abs(h) % (12 * 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}
