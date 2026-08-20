"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useVenue } from "@/components/vr/data/venue-provider";
import "@/components/vr/model/loader";

/**
 * The navmesh, turned into the one question locomotion asks: may the player
 * stand at (x, z)?
 *
 * NO PATHFINDING. The flat site runs `three-pathfinding` over these same GLBs
 * because it walks the player along a computed route to a destination the user
 * tapped. In VR the thumbstick decides where the player is going, one step at a
 * time, so there is no route to compute — only a step to accept or refuse. Zones,
 * groups and A* would be machinery for a question nobody asks here.
 */

export interface NavmeshCollider {
  /**
   * Raycast target and debug wireframe. World transforms are baked into the
   * geometry, so the mesh itself sits at identity. Not added to the scene graph
   * by default — the walkable test never touches the renderer.
   */
  collider: THREE.Mesh | null;
  /**
   * One point per triangle. Used to place a player who starts off the mesh;
   * without it they would be frozen, since every step would be refused.
   */
  centroids: THREE.Vector3[];
}

const EMPTY: NavmeshCollider = { collider: null, centroids: [] };

/**
 * The triangle soup, flattened to 2D and bucketed by location.
 *
 * The obvious implementation — raycast straight down at the collider — walks
 * EVERY triangle, because `THREE.Mesh.raycast` has no bounding hierarchy to
 * lean on. These meshes are not small: the SoFi navmesh alone is 3.6 MB of
 * geometry. Locomotion asks up to six times a frame and the clamp asks once
 * more, so that is seven linear sweeps of tens of thousands of triangles per
 * frame, on a device with a 72 Hz budget.
 *
 * A uniform XZ grid tests only the triangles covering the cell you stand in.
 * Kept in a `WeakMap` so the call sites keep passing a plain `THREE.Mesh`.
 */
interface WalkGrid {
  minX: number;
  minZ: number;
  cell: number;
  cols: number;
  rows: number;
  /** CSR offsets into `items`, length `cols * rows + 1`. */
  starts: Int32Array;
  /** Triangle indices, grouped by cell. */
  items: Int32Array;
  /** Six floats per triangle: x/z of each vertex, projected. */
  tri: Float32Array;
  /**
   * Three floats per triangle: the Y of each vertex, in the same order.
   *
   * Kept alongside the projected XZ rather than folded into it because every
   * hot path — `isWalkable`, the clamp — only ever asks the 2D question, and
   * interleaving the height would make those reads stride over data they never
   * use. Only `floorAt` touches this.
   */
  triY: Float32Array;
}

const walkGrids = new WeakMap<THREE.Mesh, WalkGrid>();

/**
 * How far apart two navmesh surfaces have to be before they count as different
 * STOREYS rather than the same floor sampled twice.
 *
 * Two and a half metres: taller than any step, ramp or tier edge in these
 * venues, and shorter than the gap between a concourse and the deck above it.
 * Used to keep a level-aware search from wandering onto another floor.
 */
export const LEVEL_HEIGHT = 2.5;

/**
 * Point-in-triangle by edge sign. The three cross products share a sign inside
 * the triangle whatever the winding, which matters because navmesh winding is
 * not dependable. A point exactly on an edge gives zero and counts as inside,
 * so shared edges leave no seam to fall through.
 */
function pointInTriangle(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

function buildWalkGrid(positions: Float32Array): WalkGrid | null {
  const triCount = Math.floor(positions.length / 9);
  if (triCount === 0) return null;

  const tri = new Float32Array(triCount * 6);
  const triY = new Float32Array(triCount * 3);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (let t = 0; t < triCount; t++) {
    for (let v = 0; v < 3; v++) {
      const x = positions[t * 9 + v * 3];
      const z = positions[t * 9 + v * 3 + 2];
      tri[t * 6 + v * 2] = x;
      tri[t * 6 + v * 2 + 1] = z;
      triY[t * 3 + v] = positions[t * 9 + v * 3 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  // About one cell per triangle. Floored at 25 cm, and the cell count capped
  // below, so a pathological navmesh cannot ask for a vast grid.
  const span = Math.max(maxX - minX, maxZ - minZ, 1e-3);
  let cell = Math.max(0.25, span / Math.max(1, Math.ceil(Math.sqrt(triCount))));

  let cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  let rows = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);

  const MAX_CELLS = 1 << 20;
  if (cols * rows > MAX_CELLS) {
    cell = Math.sqrt(((maxX - minX) * (maxZ - minZ)) / MAX_CELLS) || cell;
    cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
    rows = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
  }

  const cellOf = (value: number, min: number, limit: number) => {
    const i = Math.floor((value - min) / cell);
    return i < 0 ? 0 : i > limit - 1 ? limit - 1 : i;
  };

  // Two passes so the buckets can live in one flat Int32Array (CSR) rather than
  // `cols * rows` JS arrays — this is built for meshes with 100k triangles.
  const counts = new Int32Array(cols * rows + 1);
  const bounds = new Int32Array(triCount * 4);

  for (let t = 0; t < triCount; t++) {
    const ax = tri[t * 6];
    const az = tri[t * 6 + 1];
    const bx = tri[t * 6 + 2];
    const bz = tri[t * 6 + 3];
    const cx = tri[t * 6 + 4];
    const cz = tri[t * 6 + 5];

    const x0 = cellOf(Math.min(ax, bx, cx), minX, cols);
    const x1 = cellOf(Math.max(ax, bx, cx), minX, cols);
    const z0 = cellOf(Math.min(az, bz, cz), minZ, rows);
    const z1 = cellOf(Math.max(az, bz, cz), minZ, rows);

    bounds[t * 4] = x0;
    bounds[t * 4 + 1] = x1;
    bounds[t * 4 + 2] = z0;
    bounds[t * 4 + 3] = z1;

    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) counts[zi * cols + xi + 1]++;
    }
  }

  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];

  const starts = counts;
  const items = new Int32Array(starts[starts.length - 1]);
  const cursor = new Int32Array(cols * rows);

  for (let t = 0; t < triCount; t++) {
    const x0 = bounds[t * 4];
    const x1 = bounds[t * 4 + 1];
    const z0 = bounds[t * 4 + 2];
    const z1 = bounds[t * 4 + 3];
    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) {
        const c = zi * cols + xi;
        items[starts[c] + cursor[c]++] = t;
      }
    }
  }

  return { minX, minZ, cell, cols, rows, starts, items, tri, triY };
}

/**
 * Is the column at (x, z) over the navmesh, ON ANY LEVEL?
 *
 * PURELY 2D, so someone on a stadium concourse and someone on the field below
 * get the same answer. That was once the walkable test and it is not any more,
 * because the assumption it rested on — that a navmesh describes ONE level —
 * is false for three of the four venues: the stadium stacks a pitch, several
 * concourses and a deck over the same footprint, and the union of those is
 * walkable almost everywhere, including out over a forty-metre drop.
 *
 * `stepFloor` is what a walk asks now. This survives for the questions that
 * really are about the footprint rather than a storey.
 *
 * EXACT, with no tolerance. Widening it to paper over gaps in a rough navmesh
 * grows the walkable region OUTWARD too, which turns the cut-outs around
 * furniture and barriers into slivers and creates more holes than it closes.
 * The roughness is handled in the clamp, in TIME, where a brief crossing can be
 * told apart from actually walking out.
 */
export function isWalkable(navmesh: THREE.Mesh, x: number, z: number): boolean {
  const grid = walkGrids.get(navmesh);
  // No grid means no geometry to test against — unbounded rather than frozen.
  if (!grid) return true;

  const xi = Math.floor((x - grid.minX) / grid.cell);
  const zi = Math.floor((z - grid.minZ) / grid.cell);
  if (xi < 0 || zi < 0 || xi >= grid.cols || zi >= grid.rows) return false;

  const c = zi * grid.cols + xi;
  const end = grid.starts[c + 1];

  for (let i = grid.starts[c]; i < end; i++) {
    const t = grid.items[i] * 6;
    if (
      pointInTriangle(
        x,
        z,
        grid.tri[t],
        grid.tri[t + 1],
        grid.tri[t + 2],
        grid.tri[t + 3],
        grid.tri[t + 4],
        grid.tri[t + 5],
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * One shared floor sample. `floorAt` and `stepFloor` differ only in the band
 * they will accept, so the barycentric maths lives here once.
 *
 * Returns the height of the walkable surface at (x, z) that is NEAREST to
 * `preferY` and within [`preferY` - maxDrop, `preferY` + maxRise], or null if
 * no triangle covers the point inside that band.
 */
function sampleFloor(
  grid: WalkGrid,
  x: number,
  z: number,
  preferY: number,
  maxRise: number,
  maxDrop: number,
): number | null {
  const xi = Math.floor((x - grid.minX) / grid.cell);
  const zi = Math.floor((z - grid.minZ) / grid.cell);
  if (xi < 0 || zi < 0 || xi >= grid.cols || zi >= grid.rows) return null;

  const c = zi * grid.cols + xi;
  const end = grid.starts[c + 1];

  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = grid.starts[c]; i < end; i++) {
    const index = grid.items[i];
    const t = index * 6;

    const ax = grid.tri[t];
    const az = grid.tri[t + 1];
    const bx = grid.tri[t + 2];
    const bz = grid.tri[t + 3];
    const cx = grid.tri[t + 4];
    const cz = grid.tri[t + 5];

    if (!pointInTriangle(x, z, ax, az, bx, bz, cx, cz)) continue;

    // Barycentric weights in the XZ plane, then the same weights applied to
    // the vertex heights — which is exactly the point on the triangle's plane.
    const denom = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denom) < 1e-12) continue; // degenerate sliver

    const w1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denom;
    const w2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denom;
    const w3 = 1 - w1 - w2;

    const y = index * 3;
    const height =
      w1 * grid.triY[y] + w2 * grid.triY[y + 1] + w3 * grid.triY[y + 2];

    // THE BAND IS WHAT MAKES A LEVEL A LEVEL. A concourse and the pitch under
    // it are both "the floor at (x, z)"; only one of them is a floor you could
    // have got to from where you are standing.
    const rise = height - preferY;
    if (rise > maxRise || -rise > maxDrop) continue;

    const distance = Math.abs(rise);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = height;
    }
  }

  return best;
}

/**
 * The height of the walkable floor at (x, z), or null if there is none there.
 *
 * THIS IS WHAT STOPS WALKING FEELING LIKE FLYING. Locomotion deliberately never
 * writes the player's Y from the thumbstick — the walkable test is 2D, so a
 * step is only ever accepted or refused in XZ. On a single flat floor that is
 * correct and costs nothing. These venues are not flat: the memorial navmesh
 * spans 33 m of tiers and the stadium 66 m of bowl, with ramps and steps
 * throughout. Holding Y at whatever the spawn was means walking up a ramp
 * leaves the player at the old height, sailing over the geometry.
 *
 * The navmesh IS the floor, so its surface is the answer. The triangle under
 * the player is found from the same grid `isWalkable` uses, and the height is
 * interpolated across it barycentrically — the plane of the triangle, not the
 * nearest vertex, so a ramp reads as a smooth slope instead of a staircase.
 *
 * `preferY` DISAMBIGUATES LEVELS, and it is the whole reason this takes a hint
 * at all. A multi-storey navmesh has several triangles stacked over the same
 * (x, z) — a stadium concourse has the pitch below it and a deck above — and
 * "the floor here" has no single answer. The one nearest the height the player
 * is already at is the one they are standing on. Without the hint, crossing
 * under a walkway would drop them to the pitch.
 *
 * UNBOUNDED, so this answers "which storey is meant by this height?" — an
 * authored viewpoint whose Y is an EYE height lands on the floor a metre and a
 * half below it, which is the right answer. Use `stepFloor` for the other
 * question, "may I step there from here?", where an unbounded answer is exactly
 * the bug: it would happily hand back a deck 40 m down.
 */
export function floorAt(
  navmesh: THREE.Mesh,
  x: number,
  z: number,
  preferY: number,
): number | null {
  const grid = walkGrids.get(navmesh);
  if (!grid) return null;
  return sampleFloor(grid, x, z, preferY, Infinity, Infinity);
}

/**
 * The floor a player standing at `fromY` may step onto at (x, z), or null.
 *
 * THIS IS THE WALKABLE TEST NOW, and `isWalkable` is not, because "is there
 * navmesh over this column?" is the union of every storey. On a single-level
 * venue the two are the same question. On the stadium they are not: the bowl,
 * every concourse and the pitch stack over the same footprint, so the 2D test
 * says yes to a step off a Level 3 gate into the open air above the field —
 * and `floorAt` then reports the pitch, 40 m down, which the old caller
 * rejected as too big a drop and so held the player's height where it was.
 * The result was walking out over the void at concourse height.
 *
 * Asking for a floor WITHIN A STEP of the one you are on collapses both bugs
 * into one rule. A step is a few centimetres at walking speed, so the only way
 * onto another level is a surface that actually connects to this one — a ramp,
 * a stair, a tier — and a gap between decks can never be crossed, because
 * there is no intermediate height to pass through.
 *
 * `maxRise` and `maxDrop` are separate: a kerb you can step up is smaller than
 * a step you can drop down, and navmesh seams at a tier edge are drops.
 */
export function stepFloor(
  navmesh: THREE.Mesh,
  x: number,
  z: number,
  fromY: number,
  maxRise: number,
  maxDrop: number,
): number | null {
  const grid = walkGrids.get(navmesh);
  // No grid means no geometry to test against — unbounded rather than frozen,
  // matching `isWalkable`. The caller keeps its current height.
  if (!grid) return fromY;
  return sampleFloor(grid, x, z, fromY, maxRise, maxDrop);
}

/**
 * The nearest triangle centroid to (x, z), measured in XZ only, or null if
 * there are none.
 *
 * Three callers want this: landing a player whose spawn is off the mesh,
 * snapping a teleport target that misses it, and letting a player who has
 * physically walked off it walk back.
 *
 * `preferY` KEEPS THE ANSWER ON ONE LEVEL. Without it "nearest" is decided by
 * ground plan alone, so the closest triangle to a Level 3 gate that sits a
 * fraction off the mesh is very often the pitch directly below it — and the
 * player is relocated a storey down while the code believes it corrected a
 * rounding error. Passing the height they are meant to be at limits the search
 * to that storey; if nothing on it qualifies the search widens rather than
 * returning nothing, because being relocated to the wrong floor is still
 * better than being frozen off the mesh entirely.
 */
export function nearestCentroid(
  centroids: THREE.Vector3[],
  x: number,
  z: number,
  preferY?: number,
  maxDelta = LEVEL_HEIGHT,
): THREE.Vector3 | null {
  let nearest: THREE.Vector3 | null = null;
  let best = Infinity;
  /** Best ignoring the level filter — the fallback when the level has none. */
  let anywhere: THREE.Vector3 | null = null;
  let bestAnywhere = Infinity;

  for (const c of centroids) {
    const dx = c.x - x;
    const dz = c.z - z;
    const dSq = dx * dx + dz * dz;

    if (dSq < bestAnywhere) {
      bestAnywhere = dSq;
      anywhere = c;
    }

    if (preferY != null && Math.abs(c.y - preferY) > maxDelta) continue;

    if (dSq < best) {
      best = dSq;
      nearest = c;
    }
  }

  return nearest ?? anywhere;
}

/**
 * Builds a raycastable collider and a walk grid from the active venue's navmesh.
 *
 * SUSPENDS on the fetch, so callers must sit inside a Suspense boundary — an
 * unboundaried suspension inside R3F's `Canvas` blanks the whole scene.
 *
 * `updateMatrixWorld` and `computeBoundingBox` are called by hand: a detached
 * object never gets a world matrix from the renderer, and the bounding box is
 * how the session finds the floor height.
 */
export function useNavmeshCollider(): NavmeshCollider {
  const venue = useVenue();
  const path = venue.navmesh;

  const gltf = useGLTF(path);

  return useMemo(() => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    // EVERY mesh, not just the first — a navmesh is often one mesh per area,
    // and the rest would silently become walls.
    const sources: THREE.Mesh[] = [];
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) sources.push(mesh);
    });
    if (sources.length === 0) return EMPTY;

    // Position-only and non-indexed: the walkable test needs nothing else, and
    // dropping the rest avoids an attribute mismatch between meshes.
    const positions: number[] = [];
    for (const mesh of sources) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const flat = geo.index ? geo.toNonIndexed() : geo;
      const attr = flat.getAttribute("position");
      for (let i = 0; i < attr.count; i++) {
        positions.push(attr.getX(i), attr.getY(i), attr.getZ(i));
      }
      flat.dispose();
      if (flat !== geo) geo.dispose();
    }

    const vertices = new Float32Array(positions);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.computeBoundingBox();

    const collider = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    collider.renderOrder = 999;
    collider.updateMatrixWorld(true);

    // What `isWalkable` actually uses. The collider stays a real mesh so the
    // debug wireframe still renders from it.
    const grid = buildWalkGrid(vertices);
    if (grid) walkGrids.set(collider, grid);

    const centroids: THREE.Vector3[] = [];
    const position = geometry.getAttribute("position");

    for (let i = 0; i < position.count; i += 3) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 3; k++) {
        x += position.getX(i + k);
        y += position.getY(i + k);
        z += position.getZ(i + k);
      }
      centroids.push(new THREE.Vector3(x / 3, y / 3, z / 3));
    }

    return { collider, centroids };
  }, [gltf]);
}
