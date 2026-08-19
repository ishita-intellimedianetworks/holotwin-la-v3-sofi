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
} from "@/components-v5/shared/types";

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
  /** True for a room rather than a campus. */
  interior?: boolean;
  /**
   * Field of view for the FLAT PREVIEW behind the gate. Ignored in session —
   * the headset supplies its own projection.
   */
  fov: number;
  /** How the doll house frames this venue. */
  dollHouse: VRDollHouse;
  layouts: VRLayout[];
  hotspots: VRHotspot[];
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
  fov?: number;
  cameraHeight?: number;
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
}

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
} {
  const layouts: VRLayout[] = [];
  const hotspots: VRHotspot[] = [];

  for (const [category, entries] of Object.entries(pois ?? {})) {
    const group = categoryLabel(category);

    for (const poi of (entries ?? []) as Destination[]) {
      const camera = poi.camera
        ? {
            position: v3(poi.camera.position),
            rotationY: yawOf(poi.camera.rotation),
          }
        : undefined;

      if (camera && !NOT_A_DESTINATION.has(category)) {
        layouts.push({
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
          position: camera.position,
          rotationY: camera.rotationY,
        });
      }

      /**
       * `hotspots[]` wins over `hotspot`, as the flat viewer's own note on the
       * type says: the plural is the newer field, and an entry carrying both
       * means the singular is the legacy fallback.
       */
      const marks = poi.hotspots?.length
        ? poi.hotspots
        : poi.hotspot
          ? [poi.hotspot]
          : [];

      marks.forEach((mark, index) => {
        const point = mark as {
          position: number[];
          rotation?: number[];
          label?: string;
          note?: string;
          points?: string[];
        };

        hotspots.push({
          // The POI id alone is not unique once a destination has two markers.
          id: marks.length > 1 ? `${poi.id}#${index}` : poi.id,
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

  return { layouts, hotspots };
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
    const { layouts, hotspots } = collectPois(scene.pois);

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
      model: scene.url,
      navmesh: scene.navmeshUrl as string,
      floorPlan: scene.floorplanUrl,
      spawn,
      eyeHeight:
        tuning.cameraHeight ?? VR_DEFAULTS.cameraHeight ?? scene.eyeHeight,
      interior: scene.interior,
      fov: tuning.fov ?? VR_DEFAULTS.fov ?? DEFAULT_FOV,
      dollHouse,
      layouts,
      hotspots,
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
