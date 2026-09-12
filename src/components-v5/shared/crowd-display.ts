/**
 * Crowd tier → the dot colour and the word beside it.
 *
 * LIFTED OUT OF `destination-card.tsx` SO VR CAN READ IT. The values are
 * unchanged; the only thing that moved is where they live. They were trapped in
 * a file that imports `lucide-react` and `@/lib/utils`, so anything importing
 * them dragged the whole DOM card in — which a uikit panel inside the Canvas
 * cannot do.
 *
 * THIS IS NOT THE ONLY CROWD PALETTE IN THE PROJECT, and unifying them is
 * deliberately not this file's job:
 *
 *   - `shared/crowd.ts`      low #4a9d6e  med #f5a623  high #e8453c
 *   - here (cards, map pins) low #30d158  med #ffd60a  high #ff453a
 *
 * The second is the one the destination cards, the map pins and the notice
 * overlay all share, and matching them to each other was the point of the
 * original comment in `info-overlay.tsx` — a local copy there once used amber
 * for "med" while everything else used #ffd60a, which put two different yellows
 * on screen at once. Keep new surfaces on THIS pair unless they are drawing
 * `CrowdZone` data, which is what `crowd.ts` is for.
 */

/** Crowd tier → dot colour (red heavy · yellow moderate · green clear). */
export const CROWD_DOT: Record<string, string> = {
  high: "#ff453a", // red
  med: "#ffd60a", // yellow
  low: "#30d158", // green — classic heat-map scale
};

/** Tier word shown beside the dot — a bare dot alone doesn't read as crowd. */
export const CROWD_WORD: Record<string, string> = {
  high: "Heavy",
  med: "Moderate",
  low: "Clear",
};

/**
 * Clearest first, then busiest. `undefined` sorts last: a destination with no
 * authored crowd level is not "clear", it is unknown, and putting it at the top
 * of a "fastest entry" list would be a recommendation nobody made.
 */
const RANK: Record<string, number> = { low: 0, med: 1, high: 2 };

/** Sort key for a crowd tier. Unknown tiers sort after every known one. */
export const crowdRank = (crowd: string | undefined): number =>
  crowd != null && crowd in RANK ? RANK[crowd] : 99;
