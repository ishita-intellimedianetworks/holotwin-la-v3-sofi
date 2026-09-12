"use client";

import { Container } from "@react-three/uikit";
import {
  BoxIcon,
  BuildingIcon,
  HouseIcon,
  InfoIcon,
  LayoutGridIcon,
  LogOutIcon,
  MapIcon,
} from "@react-three/uikit-lucide";
import type { XRStore } from "@react-three/xr";
import { VENUES } from "@/components/vr/data";
import { useVenue } from "@/components/vr/data/venue-provider";
import { useVenueLoad } from "../load-progress";
import { useVRState } from "../state";
import { VRFullscreen } from "../ui/fullscreen";
import { GlassSurface } from "../ui/glass-surface";
import { IconButton } from "../ui/icon-button";
import { COLOR, POINTER_ORDER, RADIUS, SPACE } from "../ui/tokens";

/**
 * The control dock — the flat site's bottom bar, brought on board.
 *
 * ONE ROW, and short. Everything the session can do is here: home, the layout
 * list, the doll house, the venue list, help, exit — six discs, all inside the
 * comfortable middle of the view.
 *
 * It briefly carried a second row mirroring the flat site's category rail, a
 * button per category. That reads well on a screen with width to spare and
 * badly in a headset: it pushed the ends of the dock into the periphery, where
 * a hand-held ray is least accurate, and made finding a place a guess about
 * which category it was filed under. The categories moved inside the layout
 * list as headings — same organisation, fewer targets.
 *
 * VENUES ARE CHANGED FROM HERE, in both views. The entry gate deliberately
 * does not offer a picker: it opens on the default venue and this button is
 * how you move, so switching works the same way before and during a session.
 */

/** Matches the flat dock's white glyphs, sized for a 64 px disc. */
const GLYPH = 26;

/**
 * How far up from the bottom of the field of view the dock sits.
 *
 * NOT flush with the bottom edge, which is ~48° below the eye on a headset —
 * you would have to tilt your head to use it. At 26% the dock lands about 22°
 * low, just inside the ±20° comfortable range and where the eye already rests.
 */
const DOCK_BOTTOM = "26%";

/**
 * A pill of buttons on the shared glass. Both rows are built from this.
 *
 * MODULE SCOPE, not defined inside `VRToolbar`. A component created during
 * render is a new type on every render, so React unmounts and rebuilds its
 * entire subtree each time — here that is a glass surface and every icon
 * button, rebuilt whenever the player moves a category selection or a travel
 * flag changes. Exactly the churn the `visibility` note below exists to avoid.
 */
function DockRow({
  children,
  hidden,
}: {
  children: React.ReactNode;
  hidden: boolean;
}) {
  return (
    <Container
      flexDirection="row"
      borderRadius={RADIUS.dot}
      // "none" while hidden, or the dock keeps eating rays aimed at the panel
      // in front of it — `visibility` is a drawing concern only.
      pointerEvents={hidden ? "none" : "auto"}
      pointerEventsOrder={POINTER_ORDER.ui}
    >
      <GlassSurface radius={RADIUS.dot} />
      {/*
        The padding lives on an INNER container, never on the element holding
        the glass. Yoga positions an absolutely-positioned child at its parent's
        padding origin but resolves its `100%` against the parent's border box,
        so a backing layer inside a padded element comes out full width AND
        shifted by the left padding — the bar visibly offset from its own
        buttons.
      */}
      <Container
        flexDirection="row"
        alignItems="center"
        // One value for the gap and both insets, so the space around every icon
        // is identical, including the first and last.
        gap={SPACE.dock}
        paddingX={SPACE.dock}
        paddingY={SPACE.dock}
      >
        {children}
      </Container>
    </Container>
  );
}

export function VRToolbar({ store }: { store: XRStore }) {
  const {
    view,
    setOpenMenu,
    recentre,
    goToDollHouse,
    panelIsOpen,
    isTravelling,
  } = useVRState();

  const venue = useVenue();

  /**
   * Never on screen at the same time as a panel, and never mid-glide.
   *
   * An open panel owns the whole view, so there is nothing for the dock to
   * compete with for the ray — and hiding it during travel keeps the one moment
   * the player is not in control free of controls that will not respond.
   *
   * HIDDEN, NOT UNMOUNTED. `return null` would tear down a `Fullscreen`, a
   * glass surface and a dozen icon buttons on every teleport and every panel
   * open, then build them all again — a stall at both ends of a glide, in a
   * view that is otherwise only interpolating one transform. `visibility` takes
   * it off screen without touching the tree, and dropping `pointerEvents` takes
   * it off the ray, which is the half that matters.
   */
  /**
   * AND NOT WHILE THE VENUE IS STILL LOADING.
   *
   * The dock is not suspended by the venue swap — it sits outside that boundary
   * on purpose, so that opening a menu never waits on a model — which meant it
   * stayed live, and rayable, in front of the loading panel. Pressing a venue
   * or a layout there acts on a scene that does not exist yet: the press lands,
   * the panel it opens draws over the loading panel, and two things that each
   * think they own the view are drawn on top of each other.
   *
   * `ready` is the same signal the loading panel and the gate's bar read, so
   * the dock comes back at the same moment the venue does.
   */
  const { ready } = useVenueLoad();

  const hidden = panelIsOpen || isTravelling || !ready;

  const isFirstPerson = view === "first-person";

  const glyph = (
    Icon: typeof HouseIcon,
    size = GLYPH,
    // `string`, not the inferred literal type of `COLOR.text` — the default
    // narrows to "#ffffff" and would reject every other token.
    color: string = COLOR.text,
  ) => <Icon width={size} height={size} color={color} />;

  return (
    <VRFullscreen
      distanceToCamera={2}
      visibility={hidden ? "hidden" : "visible"}
      // The dock is a small pill; the rest of this root is empty view that must
      // not eat rays bound for a hotspot. Children set their own value and
      // uikit resolves `object.pointerEvents ?? parentPointerEvents`, so "none"
      // here is overridden by the rows rather than inherited by them.
      pointerEvents="none"
      // A dock at 2 m intersects walls and seating, so it must draw last and
      // unconditionally or it comes out half-buried.
      depthTest={false}
      renderOrder={1000}
    >
      <Container
        positionType="absolute"
        positionBottom={DOCK_BOTTOM}
        // Anchored. An absolute node with no `left` is placed where it would
        // have sat in normal flow, which for a centred parent is the middle of
        // the view — taking the whole dock off to one side.
        positionLeft={0}
        width="100%"
        flexDirection="column"
        alignItems="center"
        gapRow={SPACE.row}
        pointerEvents="none"
      >
        <DockRow hidden={hidden}>
          {/*
            Home. In first person this re-runs the venue's landing pose; in the
            doll house it re-frames the model. Both are the same `landToken`
            bump, so "put it back how it was" is one action with one meaning in
            either view.
          */}
          <IconButton icon={glyph(HouseIcon)} onSelect={recentre} />

          {/*
            ONE button for every destination in the venue, not a rail of them.

            This was briefly a button per category, mirroring the flat bottom
            bar literally. In a headset that is the wrong trade: it puts six to
            eight extra discs in a dock already competing for the comfortable
            middle of the view, and turns finding a place into a guess about
            which category it was filed under. The categories became the
            headings inside the one list instead — same organisation, one press.
          */}
          {isFirstPerson &&
            venue.layouts.length + venue.hotspots.length > 0 && (
              <IconButton
                icon={glyph(LayoutGridIcon)}
                onSelect={() => setOpenMenu("destinations")}
              />
            )}

          {/*
            The floor plan. Gated on the venue having one — the hotel room does
            not, and three metres of carpet does not need a map of itself.

            NOT folded into the sheet as a seventh category, though everything
            else was. A plan is a different question from a list: the list
            answers "what is here", the plan answers "where am I", and the
            second one is worth a press of its own because it is what you reach
            for when you are lost rather than when you are choosing.
          */}
          {isFirstPerson && !!venue.floorPlan && (
            <IconButton
              icon={glyph(MapIcon)}
              onSelect={() => setOpenMenu("map")}
            />
          )}

          {isFirstPerson && (
            <IconButton icon={glyph(BoxIcon)} onSelect={goToDollHouse} />
          )}

          {/* Present in BOTH views, unlike the rest. Changing venue is a fact
              about the site, not about how you are looking at one building. */}
          {VENUES.length > 1 && (
            <IconButton
              icon={glyph(BuildingIcon)}
              onSelect={() => setOpenMenu("venues")}
            />
          )}

          <IconButton
            icon={glyph(InfoIcon)}
            onSelect={() => setOpenMenu("instructions")}
          />

          <IconButton
            icon={glyph(LogOutIcon)}
            tone="danger"
            onSelect={() => store.getState().session?.end()}
          />
        </DockRow>
      </Container>
    </VRFullscreen>
  );
}
