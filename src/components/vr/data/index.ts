/**
 * The VR venue registry — `scenes.json`, read as a list of places you can walk
 * into with a headset.
 *
 * NOTHING IS AUTHORED TWICE. The flat site drives itself from the same file
 * through `components-v5/shared/data/scene-config-adapter`, and this is the
 * second adapter over the same source: add a venue there and it appears in VR,
 * move a POI and both views move with it. The two adapters produce different
 * shapes because the two engines want different things — the flat one wants
 * `floors[]` for its fade-swap, this one wants a spawn, a navmesh and two flat
 * lists — but neither owns a fact the other does not have.
 *
 * THE ONE REAL CONVERSION IS ANGLES. `scenes.json` stores every rotation as a
 * three-component Euler in RADIANS, in YXZ order, because that is what the flat
 * player applies to its camera. VR only ever needs the yaw: pitch is the
 * headset's to decide and roll would make people ill. So each pose collapses to
 * a single `rotationY` in DEGREES, which is the unit the XR origin is set from.
 */

import cfg from "@/components-v5/shared/data/scenes.json";
import vrCfg from "./vr-scenes.json";
import type {
  Destination,
  DestinationCategory,
  DestinationsByCategory,
  DestinationTransitRoute,
  DiningKind,
  TransportDestination,
} from "@/components-v5/shared/types";
import { crowdRank } from "@/components-v5/shared/crowd-display";

type V3 = [number, number, number];

const v3 = (a: number[] | undefined, fallback: V3 = [0, 0, 0]): V3 =>
  a && a.length >= 3 ? [a[0], a[1], a[2]] : fallback;

const RAD_TO_DEG = 180 / Math.PI;

/** The yaw of a `scenes.json` Euler, in degrees. See the note at the top. */
const yawOf = (rotation: number[] | undefined): number =>
  rotation && rotation.length >= 2 ? rotation[1] * RAD_TO_DEG : 0;

const degrees = (rotation: number[] | undefined): V3 => {
  const [x, y, z] = v3(rotation);
  return [x * RAD_TO_DEG, y * RAD_TO_DEG, z * RAD_TO_DEG];
};

/** A pose the XR origin can be set to. Position is metres, `rotationY` degrees. */
export interface VRPose {
  position: V3;
  rotationY: number;
}

/**
 * A saved viewpoint — one row in the Layouts menu, and a place the glide can
 * take you. Every POI in `scenes.json` with a `camera` becomes one.
 */
export interface VRLayout extends VRPose {
  id: string;
  title: string;
  /** `scenes.json`'s own category key — what the dock maps to an icon. */
  category: DestinationCategory;
  /** The POI category it came from, already in display case. */
  group: string;
  /**
   * The POI this came from. Layouts and markers authored on the same
   * destination share it, which is how picking a row in a category list also
   * reveals that destination's pins — the flat card and its map markers are one
   * thing there and must stay one thing here.
   */
  destinationId: string;
  /**
   * The SUBCATEGORY, `scenes.json`'s own `option`. The flat site renders these
   * as the chip rail inside a category — "Entrances & Gates", "Level 1",
   * "Medical" — and every POI on the memorial and the stadium carries one (26
   * and 36 of them, across 19 and 22 distinct values). Ignoring it flattened
   * two well-organised menus into one long undifferentiated list.
   */
  option?: string;
  /** Prose the flat card shows under the title. */
  note?: string;
  /** Short chips the flat card shows — "Main", "Guest Services". */
  tags?: string[];
  /** How busy it is. The flat site colours its cards by this. */
  crowd?: string;
  /** One line explaining the crowd level. */
  crowdNote?: string;
  /**
   * The card fields below carry no meaning to the Layouts MENU, which lists
   * places to stand and nothing else. They are here for the destination sheet,
   * which is the flat card rebuilt in the headset and shows all of them.
   */
  /** Dining only — campus hall or restaurant, which is the segment control. */
  kind?: DiningKind;
  /** Restaurants only — sample menu items. */
  menu?: string[];
  /** Practice only — the sports trained here, rendered as chips. */
  sports?: string[];
  /** Open/available right now — the green dot on the card. */
  open?: boolean;
  /** Seat views only — the bowl section number. */
  section?: number;
  /** Transport hubs only — the routes serving this hub. */
  transitRoutes?: DestinationTransitRoute[];
  /**
   * No walking route to here, in either direction — see `Destination`.
   * Carried because it changes what the card OFFERS, even though VR has no
   * walk to withhold: a destination flagged this way is one the authors say is
   * unreachable on foot, and saying so is honest rather than cosmetic.
   */
  teleportOnly?: boolean;
  /**
   * KEEP THE AUTHORED Y ON ARRIVAL. Elevated destinations — every stadium seat
   * view — sit above the navmesh, and the landing snaps to the walkable floor
   * by default. For these that floor is the pitch, forty metres down. See
   * `experience/teleport-driver`.
   */
  exactPose?: boolean;
  /**
   * EVERY ANNOTATION POINT THIS DESTINATION HAS, for the floor plan to pin.
   *
   * NOT the same list as `hotspots`, and the difference is the point. A 3D
   * marker has to earn its place — a pin hanging in the air over a gate you can
   * already travel to by name is a second copy of the menu, floating across a
   * concourse you are trying to look at, so `EARNS_A_MARKER` throws twenty of
   * the memorial's twenty-six away. A dot on a plan costs nothing and is the
   * whole reason to look at a plan, so it keeps all of them.
   *
   * Falls back to the camera position, so a destination authored with no
   * annotation point still appears somewhere on the map rather than nowhere.
   */
  pins: V3[];
}

/**
 * A marker in the world, and the panel it opens.
 *
 * One per ANNOTATION POINT, not per destination — `mem-svc-lost-info` is a
 * single POI holding two desks metres apart, and drawing one marker between
 * them would put it in the gap.
 */
export interface VRHotspot {
  id: string;
  label: string;
  /** `scenes.json`'s own category key. */
  category: DestinationCategory;
  group: string;
  /** The POI this marker belongs to. See `VRLayout.destinationId`. */
  destinationId: string;
  /** Where the marker sits. */
  position: V3;
  /** The authored orientation of the marker plate, in degrees. */
  rotation: V3;
  /** The subcategory this marker sits under. See `VRLayout.option`. */
  option?: string;
  /** Prose for the panel, if the data carries any. */
  note?: string;
  /** Bullet lines for the panel. */
  points?: string[];
  /** Short chips — the flat card shows these under the title. */
  tags?: string[];
  /** How busy it is, and why. */
  crowd?: string;
  crowdNote?: string;
  /** Where to stand to look at it, if the POI records a camera. */
  camera?: VRPose;
}

/**
 * A notice — an event update, a closure, a crowd reading.
 *
 * NOT A DESTINATION, and that separation is the whole reason this is a third
 * list rather than a looser filter on the first. `scenes.json` files these
 * under `pois` with a `camera`, because the flat site frames them for a card —
 * but "West Ramp Closed" is a thing to KNOW, not a place to be sent, and four
 * of the stadium's sit 15.9 m off the navmesh precisely because nobody meant
 * them to be stood on. See `NOT_A_DESTINATION`.
 *
 * The camera comes along anyway, for the ones that have a sensible one: a
 * closure you can look at from a walkable spot is worth being shown. The panel
 * decides whether to offer it; the data does not throw it away.
 */
export interface VRNotice {
  id: string;
  title: string;
  category: DestinationCategory;
  group: string;
  /** The notice TYPE — "Closures", "Today's Events". Its chip on the card. */
  option?: string;
  note?: string;
  tags?: string[];
  /** Where to stand to see it, if the POI records a camera worth using. */
  camera?: VRPose;
}

/**
 * One line of the crowd board: a place, how busy it is, and why.
 *
 * DERIVED, NOT AUTHORED. `scenes.json` has no crowd feed — the flat app's
 * `CrowdFeed` component reads a `crowdFeed` array that is empty in every scene,
 * and its `crowdFlowGlb` heat-map overlay is never configured either. What IS
 * authored is `crowd` and `crowdNote` on individual POIs: ten of the memorial's
 * gates and the stadium's entrances carry them.
 *
 * So the board is those POIs, ranked. That is not a reduced version of some
 * richer feed that exists elsewhere; it is the only crowd data there has ever
 * been, presented as a list instead of one badge at a time.
 */
export interface VRCrowdRow {
  /** The POI this reading belongs to — travel goes through its layout. */
  destinationId: string;
  title: string;
  /** "low" | "med" | "high", straight from `scenes.json`. */
  crowd: string;
  note?: string;
  /** The category it came from, in display case — "Gates & Facilities". */
  group: string;
}

/** How the doll house frames this venue. See `vr-scenes.json`. */
export interface VRDollHouse {
  /** Where the table sits, metres from the floor-level XR origin. */
  position: [number, number, number];
  /** How wide the model reads on it, in metres. */
  tableSpan: number;
  /** Degrees about X. 90 is a plan view. */
  tilt: number;
  /** Degrees about Y. */
  spin: number;
  /** How far the thumbstick may tilt it, [min, max] in degrees. */
  tiltRange: [number, number];
}

export interface VRVenue {
  id: string;
  title: string;
  /** The GLB you walk around in. */
  model: string;
  /** The GLB that decides where you may stand. */
  navmesh: string;
  /**
   * Top-down orthographic render of the venue, or undefined. The same PNG the
   * flat minimap uses, and it MUST be framed to the model's bbox exactly — the
   * world-to-plan mapping has no way to detect a crop. The hotel room has none.
   */
  floorPlan?: string;
  /**
   * Where the player lands, from the venue's `startPosition` / `startRotation`.
   * Its Y is replaced at runtime by the navmesh floor — see `session`.
   */
  spawn: VRPose;
  /**
   * The flat player's eye height. NOT added to the XR origin: a headset
   * supplies standing height itself, and adding it again puts the player's head
   * through the ceiling. Kept because it is the honest record of how tall a
   * person is in this model's units.
   */
  eyeHeight?: number;
  /**
   * Metres added to every navmesh height reading in this venue. Normally 0.
   *
   * NOT an eye height — see above. This is the correction for a navmesh whose
   * DATUM is wrong: baked a hand's width above the geometry it describes, or
   * exported at eye level rather than floor level. That is a fact about the
   * asset, so it is authored per venue in `vr-scenes.json` rather than guessed.
   *
   * It applies in exactly one place conceptually — "what height is the floor
   * here?" — and therefore in all three that ask: the spawn, a teleport
   * landing, and every step of a walk. They cannot drift apart.
   */
  groundOffset: number;
  /** True for a room rather than a campus. */
  interior?: boolean;
  /**
   * Whether to collapse repeated geometry into `InstancedMesh` on load.
   *
   * ONLY WORTH IT ON A MODEL THAT STILL HAS REPEATS. The venues rebuilt by
   * `npm run vr:optimize` have already been merged by material, so there is
   * nothing left for the pass to find — measured, the village and stadium
   * builds have ZERO groups of four-or-more identical draws — and running it
   * costs two full traversals of the scene for no benefit. The memorial loads
   * the flat site's own model, where it removes 1,370 of 2,471 draw calls.
   */
  instancing: boolean;
  /**
   * Field of view for the FLAT PREVIEW behind the gate. Ignored in session —
   * the headset supplies its own projection.
   */
  fov: number;
  /**
   * The camera's far plane, in metres. NOT preview-only, unlike `fov`: three
   * hands the camera's near and far to the session as `depthNear`/`depthFar`,
   * so this is the headset's clip distance too.
   *
   * PER VENUE BECAUSE THE VENUES ARE NOT THE SAME SIZE — 290 m corner to corner
   * for the village, 1274 m for the memorial. One number big enough for the
   * memorial spends the depth buffer's precision everywhere, and lost precision
   * is what lets two coplanar surfaces fight and a floor read as see-through.
   * Sized to the model it has to contain and no further.
   */
  far: number;
  /** How the doll house frames this venue. */
  dollHouse: VRDollHouse;
  layouts: VRLayout[];
  hotspots: VRHotspot[];
  /** Event updates and the like — things to read, not places to go. */
  notices: VRNotice[];
  /** The crowd board, clearest first. Empty where nothing authors a level. */
  crowdRows: VRCrowdRow[];
  /**
   * Venues reachable by transit from here, and which hub to board at. The
   * village authors one; nothing else does.
   */
  transport: TransportDestination[];
  /**
   * The floor plan is a NUMBERED LIST rather than a field of named pins.
   *
   * The memorial and the stadium both set it, and the reason is density: 26 and
   * 36 POIs on one plan, whose names do not fit beside their dots at any
   * legible size. The flat map answers that by numbering the dots and putting
   * the names in a list beside the plan, which is a different drawing, not a
   * different style — see `drawHotspots`.
   */
  mapListMode: boolean;
  /**
   * Marker disc radius in metres, where the venue states one. The stadium's
   * 0.05 is the only override; everything else uses the marker's own default.
   */
  hotspotSize?: number;
  /**
   * A press on the plan lands on the NEAREST WALKABLE TRIANGLE rather than
   * where it was pressed. The memorial sets it — its plan covers stands its
   * navmesh does not, so an honest projection of the press would drop the
   * player through the building.
   */
  clickSnapToNav: boolean;
  locomotion: {
    /** Metres per second at full stick. */
    moveSpeed: number;
    /** Degrees per second at full stick. */
    turnSpeed: number;
    /** How long a "travel to" glide takes. */
    teleportSeconds: number;
  };
}

/**
 * What each POI category is called in the menus.
 *
 * The keys are `scenes.json`'s own, which are terse and inconsistent by
 * category — "eventupdates" and "infra" sit next to "seating". A row that says
 * "Infra" is a row nobody presses.
 */
const GROUP_LABELS: Partial<Record<DestinationCategory, string>> = {
  restaurants: "Food & Drink",
  practice: "Practice Venues",
  transport: "Transport",
  wellness: "Wellness",
  hostel: "Accommodation",
  entrance: "Entrances",
  seating: "Seat Views",
  accessibility: "Accessibility",
  discovery: "Discover",
  transit: "Transit",
  cctv: "Security",
  services: "Services",
  seatviews: "Seat Views",
  safety: "Safety & Exits",
  layouts: "Gates & Facilities",
  crowdflow: "Crowd Flow",
  eventupdates: "Event Updates",
  infra: "Infrastructure",
};

/**
 * Categories that are NOT places to stand.
 *
 * `scenes.json` files a few things under `pois` that are notices rather than
 * destinations — an event update is "West Ramp Closed", a crowd-flow entry is a
 * density reading. They carry a `camera` because the flat site frames them for
 * a card, not because anyone should be teleported there, and four of the
 * stadium's sit 15.9 m off the navmesh precisely because they were never meant
 * to be stood on.
 *
 * The Layouts list is the list of places you can GO, so anything here is left
 * out of it. Their MARKERS are unaffected — a closure is still worth seeing
 * pinned in the world, it is just not somewhere to walk.
 */
const NOT_A_DESTINATION = new Set(["eventupdates", "crowdflow"]);

export const categoryLabel = (key: string): string =>
  GROUP_LABELS[key as DestinationCategory] ??
  key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The VR tuning file, narrowed to what is read here.
 *
 * Every field is optional at every level: a venue absent from `vr-scenes.json`
 * falls back to `defaults`, and a value absent from `defaults` falls back to
 * the flat `scenes.json` value or a constant below. That chain is what lets a
 * venue be added to the flat site and work in VR before anyone tunes it.
 */
interface VRTuning {
  /**
   * Keep this venue out of VR entirely — no gate entry, no row in the Venues
   * panel, no `/vr/<id>` route. The flat site is unaffected: this file is the
   * VR-only half of the config, so hiding something here cannot hide it there.
   */
  hidden?: boolean;
  model?: string;
  fov?: number;
  cameraHeight?: number;
  groundOffset?: number;
  far?: number;
  instancing?: boolean;
  firstPerson?: { position?: number[]; rotationY?: number };
  /**
   * `number[]`, not the tuple, for `position` and `tiltRange`: TypeScript reads
   * a JSON import's arrays as `number[]` and will not narrow them to a fixed
   * length, so declaring the tuple here makes the whole cast fail. They are
   * fixed back to tuples where they are used.
   */
  dollHouse?: Omit<Partial<VRDollHouse>, "position" | "tiltRange"> & {
    position?: number[];
    tiltRange?: number[];
  };
  locomotion?: Partial<VRVenue["locomotion"]>;
}

const VR_DEFAULTS = (vrCfg as { defaults?: VRTuning }).defaults ?? {};
const VR_VENUES = (vrCfg as { venues?: Record<string, VRTuning> }).venues ?? {};

const DOLL_HOUSE_FALLBACK: VRDollHouse = {
  position: [0, 1.35, -2.6],
  tableSpan: 1.6,
  tilt: 60,
  spin: 0,
  tiltRange: [12, 90],
};

const DEFAULT_LOCOMOTION = { moveSpeed: 1.6, teleportSeconds: 1.5 };
const TURN_SPEED = 90;
const DEFAULT_FOV = 70;

/**
 * The far plane for a venue that does not state one, in metres.
 *
 * Generous rather than tuned: an unstated far plane belongs to a venue nobody
 * has measured, and clipping the far side off a building is a worse failure
 * than a soft depth buffer. Every venue that IS measured overrides it.
 */
const DEFAULT_FAR = 2000;

/** The raw shape of a `scenes.json` entry, narrowed to what VR reads. */
interface RawScene {
  key: string;
  label: string;
  url: string;
  navmeshUrl?: string;
  floorplanUrl?: string;
  startPosition?: number[];
  startRotation?: number[];
  eyeHeight?: number;
  interior?: boolean;
  dollhouseOnly?: boolean;
  pois?: DestinationsByCategory;
  transportDestinations?: TransportDestination[];
  mapListMode?: boolean;
  hsSize?: number;
  clickSnapToNav?: boolean;
}

/**
 * The categories whose markers stand on their own, whatever else the data says.
 *
 * A MARKER HAS TO POINT AT SOMETHING YOU COULD NOT OTHERWISE FIND. Everything
 * with a camera is already in the Layouts menu, reachable by name, so a pin
 * floating on a gate you can travel to is not information — it is a second copy
 * of the menu, hung in the air at eye level across a concourse you are trying
 * to look at. Measured on the memorial, twenty of its twenty-six markers were
 * exactly that: gates and parking, one pin each.
 *
 * A FACILITY IS THE OTHER CASE, and it is why this is a category test rather
 * than a "does it carry text" test. A CCTV position, a Wi-Fi node, a medical
 * station, a Lost & Found — those are the things somebody actually scans a
 * concourse for, and every one of the stadium's six carries no prose at all. A
 * text test would have deleted precisely the markers worth keeping and left the
 * gates behind, which is backwards.
 *
 * Anything outside this set still qualifies by carrying real prose of its own.
 */
const EARNS_A_MARKER = new Set<string>([
  "services",
  "infra",
  "safety",
  "accessibility",
  "cctv",
  "transit",
]);

/**
 * Flatten one venue's POIs into the two lists the menus render.
 *
 * A POI can be either, both or neither:
 *
 *   - a `camera` makes it a LAYOUT — somewhere to stand.
 *   - `hotspots[]` (or a single `hotspot`) make it one or more MARKERS.
 *
 * `mem-svc-lost-info` is both, twice over: one camera on the concourse and two
 * desks to look at from it. `sta-lay-ent-gate-1` is a camera and nothing else.
 * Neither list is a subset of the other, which is why they are built together
 * rather than one being filtered out of the other.
 */
function collectPois(pois: DestinationsByCategory | undefined): {
  layouts: VRLayout[];
  hotspots: VRHotspot[];
  notices: VRNotice[];
  crowdRows: VRCrowdRow[];
} {
  const layouts: VRLayout[] = [];
  const hotspots: VRHotspot[] = [];
  const notices: VRNotice[] = [];
  const crowdRows: VRCrowdRow[] = [];

  for (const [category, entries] of Object.entries(pois ?? {})) {
    const group = categoryLabel(category);

    for (const poi of (entries ?? []) as Destination[]) {
      const camera = poi.camera
        ? {
            position: v3(poi.camera.position),
            rotationY: yawOf(poi.camera.rotation),
          }
        : undefined;

      if (NOT_A_DESTINATION.has(category)) {
        /**
         * A NOTICE, and it goes in its own list whether or not it has a camera.
         * The camera test below is only about whether the panel can offer to
         * take you there; a closure with no viewpoint is still a closure, and
         * dropping it would silently shorten the board.
         */
        notices.push({
          id: poi.id,
          title: poi.label,
          category: category as DestinationCategory,
          group,
          option: poi.option,
          note: poi.note,
          tags: poi.tags,
          camera,
        });
      } else if (camera) {
        const marks = poi.hotspots?.length
          ? poi.hotspots
          : poi.hotspot
            ? [poi.hotspot]
            : [];

        layouts.push({
          pins: marks.length
            ? marks.map((m) => v3(m.position))
            : [camera.position],
          id: poi.id,
          title: poi.label,
          category: category as DestinationCategory,
          group,
          destinationId: poi.id,
          option: poi.option,
          note: poi.note,
          tags: poi.tags,
          crowd: poi.crowd,
          crowdNote: poi.crowdNote,
          kind: poi.kind,
          menu: poi.menu,
          sports: poi.sports,
          open: poi.open,
          section: poi.section,
          transitRoutes: poi.transit?.routes,
          teleportOnly: poi.teleportOnly,
          exactPose: poi.exactPose,
          position: camera.position,
          rotationY: camera.rotationY,
        });
      }

      /**
       * The crowd board, built from whatever carries a level.
       *
       * Outside the branch above because a reading is worth listing wherever it
       * was authored — and unlike a layout it does not need a camera, only a
       * name and a level.
       */
      if (poi.crowd) {
        crowdRows.push({
          destinationId: poi.id,
          title: poi.label,
          crowd: poi.crowd,
          note: poi.crowdNote,
          group,
        });
      }

      /**
       * `hotspots[]` wins over `hotspot`, as the flat viewer's own note on the
       * type says: the plural is the newer field, and an entry carrying both
       * means the singular is the legacy fallback.
       */
      const markers = poi.hotspots?.length
        ? poi.hotspots
        : poi.hotspot
          ? [poi.hotspot]
          : [];

      markers.forEach((mark, index) => {
        const point = mark as {
          position: number[];
          rotation?: number[];
          label?: string;
          note?: string;
          points?: string[];
        };

        /**
         * DOES THIS MARKER EARN ITS PLACE? See `EARNS_A_MARKER`.
         *
         * Built from the marker's own fields rather than the POI's, because a
         * destination with several pins can carry prose on one of them.
         */
        const prose =
          (point.note ?? poi.note) != null ||
          (point.points?.length ?? 0) > 0 ||
          (poi.tags?.length ?? 0) > 0;

        if (!EARNS_A_MARKER.has(category) && !prose) return;

        hotspots.push({
          // The POI id alone is not unique once a destination has two markers.
          id: markers.length > 1 ? `${poi.id}#${index}` : poi.id,
          label: point.label ?? poi.label,
          category: category as DestinationCategory,
          group,
          destinationId: poi.id,
          option: poi.option,
          tags: poi.tags,
          crowd: poi.crowd,
          crowdNote: poi.crowdNote,
          position: v3(point.position),
          rotation: degrees(point.rotation),
          note: point.note ?? poi.note,
          points: point.points,
          camera,
        });
      });
    }
  }

  /**
   * CLEAREST FIRST, because the board's job is to answer "which way in?".
   * Busiest-first would be a ranking of problems; this is a recommendation.
   * Ties keep authoring order, which groups a venue's gates together.
   */
  crowdRows.sort((a, b) => crowdRank(a.crowd) - crowdRank(b.crowd));

  return { layouts, hotspots, notices, crowdRows };
}

/**
 * Every venue in the site that can be walked into.
 *
 * A `dollhouseOnly` entry is dropped rather than listed and greyed: the whole
 * point of this route is standing inside a place, and one that cannot be stood
 * in has nothing to offer here. One with no navmesh is dropped for the same
 * reason — with nothing to say where the floor is, the player arrives somewhere
 * they cannot walk.
 */
export const VENUES: VRVenue[] = (cfg.scenes as RawScene[])
  .filter((scene) => !scene.dollhouseOnly && !!scene.navmeshUrl)
  // Hidden in VR only — see `VRTuning.hidden`.
  .filter((scene) => !VR_VENUES[scene.key]?.hidden)
  .map((scene) => {
    const { layouts, hotspots, notices, crowdRows } = collectPois(scene.pois);

    /**
     * VR tuning wins over the flat value wherever it is stated.
     *
     * `??` and not `||` throughout, so a deliberate 0 — a zero rotation, a
     * spawn on the origin — survives instead of being replaced by the fallback.
     */
    const tuning = VR_VENUES[scene.key] ?? {};
    const dh = { ...VR_DEFAULTS.dollHouse, ...tuning.dollHouse };
    const dollHouse: VRDollHouse = {
      position: dh.position ? v3(dh.position) : DOLL_HOUSE_FALLBACK.position,
      tableSpan: dh.tableSpan ?? DOLL_HOUSE_FALLBACK.tableSpan,
      tilt: dh.tilt ?? DOLL_HOUSE_FALLBACK.tilt,
      spin: dh.spin ?? DOLL_HOUSE_FALLBACK.spin,
      tiltRange:
        dh.tiltRange && dh.tiltRange.length >= 2
          ? [dh.tiltRange[0], dh.tiltRange[1]]
          : DOLL_HOUSE_FALLBACK.tiltRange,
    };

    const locomotion = {
      moveSpeed:
        tuning.locomotion?.moveSpeed ??
        VR_DEFAULTS.locomotion?.moveSpeed ??
        DEFAULT_LOCOMOTION.moveSpeed,
      turnSpeed:
        tuning.locomotion?.turnSpeed ??
        VR_DEFAULTS.locomotion?.turnSpeed ??
        TURN_SPEED,
      teleportSeconds:
        tuning.locomotion?.teleportSeconds ??
        VR_DEFAULTS.locomotion?.teleportSeconds ??
        DEFAULT_LOCOMOTION.teleportSeconds,
    };

    /**
     * The first-person spawn. VR's own pose if it has one, else the flat
     * `startPosition` / `startRotation` converted from radians.
     */
    const spawn: VRPose = tuning.firstPerson?.position
      ? {
          position: v3(tuning.firstPerson.position),
          rotationY: tuning.firstPerson.rotationY ?? 0,
        }
      : {
          position: v3(scene.startPosition),
          rotationY: yawOf(scene.startRotation),
        };

    return {
      id: scene.key,
      title: scene.label,
      /**
       * A VR-ONLY BUILD OF THE SAME BUILDING, where one exists.
       *
       * `scenes.json` names the model the flat site draws, and a desktop GPU
       * draws it happily — one eye, no deadline. A headset draws it twice
       * against 13.9 ms, and the memorial submitted 2,471 draw calls doing it.
       * So VR gets a rebuilt copy: same geometry, same materials, same
       * coordinates, merged so it can be submitted in 201.
       *
       * A path here rather than a flag, because the two files are a fact about
       * the assets on disk. `npm run vr:optimize` produces them and
       * `npm run vr:check` verifies both the budget and that the rebuild did
       * not move the building out from under the navmesh.
       */
      model: tuning.model ?? VR_DEFAULTS.model ?? scene.url,
      navmesh: scene.navmeshUrl as string,
      floorPlan: scene.floorplanUrl,
      spawn,
      eyeHeight:
        tuning.cameraHeight ?? VR_DEFAULTS.cameraHeight ?? scene.eyeHeight,
      groundOffset: tuning.groundOffset ?? VR_DEFAULTS.groundOffset ?? 0,
      interior: scene.interior,
      instancing: tuning.instancing ?? VR_DEFAULTS.instancing ?? true,
      fov: tuning.fov ?? VR_DEFAULTS.fov ?? DEFAULT_FOV,
      far: tuning.far ?? VR_DEFAULTS.far ?? DEFAULT_FAR,
      dollHouse,
      layouts,
      hotspots,
      notices,
      crowdRows,
      transport: scene.transportDestinations ?? [],
      mapListMode: scene.mapListMode ?? false,
      hotspotSize: scene.hsSize,
      clickSnapToNav: scene.clickSnapToNav ?? false,
      locomotion,
    };
  });

/** The site's own name, for the gate and the venue menu's heading. */
export const SITE_LABEL: string = cfg.label;

/** The venue a visit opens on, and the fallback for an unknown id. */
export const DEFAULT_VENUE_ID: string = VENUES[0]?.id ?? "";

export function findVenue(id: string | undefined): VRVenue | undefined {
  return VENUES.find((venue) => venue.id === id);
}

/** Never undefined — an unknown id falls back rather than blanking the scene. */
export function getVenue(id: string | undefined): VRVenue {
  return findVenue(id) ?? VENUES[0];
}
