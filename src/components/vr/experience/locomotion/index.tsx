"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import {
  floorAt,
  nearestCentroid,
  stepFloor,
} from "@/components/vr/hooks/use-navmesh-collider";

/**
 * Thumbstick locomotion with navmesh occlusion. Left stick walks, right stick
 * turns smoothly; a step off the navmesh is refused.
 *
 * ONE QUESTION ABOUT THE GROUND, NOT TWO: is there a walkable surface at the
 * place I am stepping to, within a step of the one I am standing on? The answer
 * both permits the step and supplies the new height, so the two can never
 * disagree.
 *
 * IT USED TO BE TWO, and both were wrong on a multi-level venue. Permission was
 * a purely 2D test — is (x, z) inside the navmesh footprint? — which is the
 * UNION of every storey stacked over that column, so a step off a Level 3 gate
 * into the air above the pitch was allowed because the pitch is navmesh. Height
 * was then read separately, rejected for being a 40 m drop, and the player kept
 * the height they had: walking out over the void at concourse level, exactly
 * the bug this file's own guard was written to prevent.
 *
 * A step at walking speed is a few centimetres, so requiring the destination
 * floor to be within a step of the current one means another level can only
 * ever be reached the way a person would reach it — up a ramp, a stair or a
 * tier — and a gap between decks cannot be crossed at all, because there is no
 * intermediate height to pass through.
 *
 * The height also has to be READ rather than held. The memorial navmesh spans
 * 33 m of tiers and the stadium 66 m of bowl; holding Y at whatever the spawn
 * was means a ramp passes underneath the player instead of carrying them,
 * which is what made walking feel like flying.
 *
 * NO PATHFINDING. The flat site routes the player with `three-pathfinding`
 * because it walks them to a destination they tapped; here the stick decides,
 * one step at a time, so there is no route to compute.
 */

/** Fallback metres per second. Overridden per venue — see `data`. */
const DEFAULT_MOVE_SPEED = 1.6;
/** Fallback degrees per second at full deflection of the turn stick. */
const DEFAULT_TURN_SPEED = 90;
/** Below this the stick is treated as centred. */
const DEADZONE = 0.15;

/**
 * How fast the player settles onto the floor height, per second.
 *
 * Smoothed rather than snapped so a step up reads as a step rather than a jolt
 * — the eye tolerates the floor arriving over ~100 ms, and a hard snap in a
 * headset is felt in the stomach. High enough that a ramp never lags behind the
 * walk.
 */
const FLOOR_FOLLOW_RATE = 12;

/**
 * The tallest rise a single step may climb, in metres.
 *
 * Half a metre: taller than any kerb, stair nosing or navmesh seam in these
 * venues, and far shorter than the gap between two decks. A ramp is unaffected
 * — at 3.2 m/s and 72 Hz a step is about 4 cm, so even a 45° slope rises 4 cm.
 * What this refuses is a step that would ARRIVE on another storey.
 */
const MAX_STEP_UP = 0.5;

/**
 * The deepest drop a single step may fall, in metres.
 *
 * Larger than the rise, because a drop is the forgiving direction — walking off
 * a low tier edge should carry you down it rather than stop you dead — and
 * because navmesh seams at those edges are drops. Still nowhere near a storey.
 */
const MAX_STEP_DOWN = 0.8;

/**
 * Below this, a head is not a head, in metres.
 *
 * A tracked headset in a `local-floor` space reports the wearer's actual height
 * above the floor — 1.5 to 1.9 m standing, and still over a metre for someone
 * sitting down. A runtime with no floor estimate reports something near zero,
 * because it is measuring from wherever the head happened to be. 0.6 m is below
 * any real person and far above that failure.
 */
const MIN_HEAD_HEIGHT = 0.6;

/** Used when a venue authored no eye height and the runtime supplies none. */
const FALLBACK_EYE_HEIGHT = 1.6;

const UP = new THREE.Vector3(0, 1, 0);

// Module scope: a useFrame body must not allocate.
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _step = new THREE.Vector3();
const _head = new THREE.Vector3();

export function NavmeshLocomotion({
  originRef,
  navmesh,
  centroids,
  spawn,
  landToken,
  moveSpeed = DEFAULT_MOVE_SPEED,
  turnSpeed = DEFAULT_TURN_SPEED,
  groundOffset = 0,
  eyeHeight,
  standingLiftRef,
  isTravelling,
}: {
  originRef: RefObject<THREE.Group | null>;
  navmesh: THREE.Mesh | null;
  /** One point per navmesh triangle, for placing a player who starts off it. */
  centroids: THREE.Vector3[];
  /** Landing pose. Applied once, on the first frame after a `landToken` bump. */
  spawn: { position: [number, number, number]; rotationY: number };
  /** Walking speed in m/s. Per-venue: a hotel room is not a stadium. */
  moveSpeed?: number;
  /** Degrees per second at full stick deflection. */
  turnSpeed?: number;
  /**
   * Metres between the navmesh surface and where the XR origin should sit.
   * Normally 0 — see `data`. Applied to every height this file writes, so the
   * walk cannot settle at a different height from the spawn or a landing.
   */
  groundOffset?: number;
  /**
   * The venue's authored eye height, used ONLY as the fallback when the runtime
   * does not report one of its own. See `standingLiftRef` in `../state`.
   */
  eyeHeight?: number;
  /** Shared with the teleport, so a landing and a walk agree. `../state`. */
  standingLiftRef?: RefObject<number>;
  /** True while a "travel to" glide is in flight — sticks are ignored then. */
  isTravelling?: () => boolean;
  /** Bump to re-apply the landing pose, so re-landing is the same code path. */
  landToken?: number;
}) {
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const placed = useRef(false);

  /**
   * The navmesh height of the storey the player is ON — the surface, before
   * `groundOffset`.
   *
   * THE LEVEL IS STATE, and it has to be, because the navmesh cannot answer
   * "which floor am I on?" from a position alone: several triangles stack over
   * the same column and they are all equally the floor there. Carrying the last
   * one the player legitimately stood on is what makes the next step's question
   * answerable — within a step of THIS, not within a step of anything.
   *
   * It is deliberately not the same number as `origin.position.y`. That one is
   * eased toward the floor over ~100 ms so a kerb reads as a step rather than a
   * jolt, and testing against a value that is still catching up would let a
   * fast walk creep down a stack of tiers.
   */
  const groundY = useRef(0);
  /** True on the frame a glide is still in flight, so its end can be seen. */
  const travelling = useRef(false);

  // In an effect, not during render: mutating a ref while rendering can
  // silently miss updates.
  useEffect(() => {
    placed.current = false;
  }, [landToken]);

  useFrame((state, delta) => {
    const origin = originRef.current;
    if (!origin) return;

    // ── Land the player, once ────────────────────────────────────────────────
    // Imperative, not props on XROrigin: this group is mutated every frame
    // below, and a prop would snap the player back on every re-render.
    //
    // A landing point off the navmesh falls back to the nearest walkable
    // triangle, or every step would be refused and the player could not move.
    if (!placed.current && navmesh) {
      placed.current = true;

      origin.position.set(...spawn.position);
      origin.rotation.y = THREE.MathUtils.degToRad(spawn.rotationY);

      const p = origin.position;

      /**
       * `floorAt`, not `isWalkable`, and the difference matters: this needs the
       * HEIGHT as well as the permission, and asking one function for both is
       * what guarantees the player is put down on the surface the first step
       * will be measured against. Two calls could disagree; this cannot.
       *
       * Unbounded — the spawn is a fresh start, not a step, so any storey is
       * reachable. `spawn.position[1]` is what says which one.
       */
      let ground = floorAt(navmesh, p.x, p.z, p.y);

      if (ground == null) {
        const nearest = nearestCentroid(centroids, p.x, p.z, p.y);
        if (nearest) {
          p.x = nearest.x;
          p.z = nearest.z;
          ground = floorAt(navmesh, p.x, p.z, nearest.y) ?? nearest.y;
        }
      }

      groundY.current = ground ?? p.y - groundOffset;
      p.y = groundY.current + groundOffset + (standingLiftRef?.current ?? 0);
    }

    // The teleport owns the origin until it lands.
    if (isTravelling?.()) {
      travelling.current = true;
      return;
    }

    /**
     * JUST LANDED. Re-read the storey before the next step is judged.
     *
     * A glide crosses the venue and can put the player on a different deck
     * entirely; without this the first step after arriving is tested against
     * the level they set off from, which either refuses every direction or —
     * worse, when the two happen to be within a step — walks them off the new
     * deck as though the old one were still under them.
     */
    if (travelling.current) {
      travelling.current = false;
      if (navmesh) {
        const p = origin.position;
        const hint = p.y - groundOffset - (standingLiftRef?.current ?? 0);
        groundY.current = floorAt(navmesh, p.x, p.z, hint) ?? hint;
      }
    }

    /**
     * MEASURE THE HEAD BEFORE TRUSTING THE FLOOR.
     *
     * Every height in this file is the navmesh surface, which is right exactly
     * as long as something else is putting the player's head above their feet.
     * A headset does. A runtime that never got a floor estimate does not, and
     * then feet-on-the-floor is eyes-on-the-floor. See `standingLiftRef` in
     * `../state` for why this is measured rather than configured.
     *
     * Every frame rather than once, because the reference space can be
     * re-established mid-session — the wearer recentres, the guardian is
     * redrawn — and a lift resolved from one bad first frame would otherwise
     * stand for the rest of the visit.
     */
    if (standingLiftRef) {
      state.camera.getWorldPosition(_head);
      /**
       * NOT minus the lift already applied. The lift moves the origin, and the
       * head is inside the origin, so it moves with it — the DIFFERENCE is what
       * the runtime reports and is unaffected by how far this has raised them
       * both. Subtracting it here made the measurement chase its own correction.
       */
      const headAbove = _head.y - origin.position.y;

      standingLiftRef.current =
        headAbove >= MIN_HEAD_HEIGHT
          ? 0
          : (eyeHeight ?? FALLBACK_EYE_HEIGHT) - Math.max(0, headAbove);
    }

    // Clamp so a stalled frame — a shader compile, a texture upload — cannot
    // fling the player across the stadium.
    const dt = Math.min(delta, 0.1);

    // ── Walk — left stick, relative to where the head is looking ─────────────
    const move = left?.gamepad?.["xr-standard-thumbstick"];
    const mx = move?.xAxis ?? 0;
    const my = move?.yAxis ?? 0;

    if (Math.hypot(mx, my) > DEADZONE) {
      // In session, three writes the HMD pose onto the default camera each
      // frame, so this is the direction the user is actually facing.
      state.camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      _right.crossVectors(_forward, UP).normalize();

      // Pushing the stick forward reports yAxis ≈ -1, hence the negation.
      _step
        .set(0, 0, 0)
        .addScaledVector(_forward, -my)
        .addScaledVector(_right, mx);

      if (_step.lengthSq() > 0) {
        _step.normalize().multiplyScalar(moveSpeed * dt);

        const p = origin.position;
        const dx = _step.x;
        const dz = _step.z;

        // Test where the HEAD is going, not the origin. The origin is the
        // guardian's centre and the turn pivots it around the head, so it can
        // sit inside a wall while the player stands on good floor — testing it
        // then refuses every direction and walking dies.
        state.camera.getWorldPosition(_head);
        const hx = _head.x;
        const hz = _head.z;

        /**
         * ONE TEST, ASKED OF THE STOREY WE ARE ON.
         *
         * `stepFloor` returns the height of a walkable surface at the
         * destination that is within a step of `groundY` — so a null is both
         * "there is nothing there" and "what is there is a different floor",
         * which are the same refusal as far as a walk is concerned. The value
         * it returns IS the new height; nothing else measures the ground.
         */
        let ground: number | null = null;

        if (!navmesh) {
          // Still loading — move unbounded rather than freeze.
          p.x += dx;
          p.z += dz;
        } else {
          ground = stepFloor(
            navmesh,
            hx + dx,
            hz + dz,
            groundY.current,
            MAX_STEP_UP,
            MAX_STEP_DOWN,
          );

          if (ground != null) {
            p.x += dx;
            p.z += dz;
          } else {
            // Blocked diagonally — slide along the wall instead of stopping
            // dead. Each axis is a step in its own right and is tested as one.
            ground = stepFloor(
              navmesh,
              hx + dx,
              hz,
              groundY.current,
              MAX_STEP_UP,
              MAX_STEP_DOWN,
            );

            if (ground != null) {
              p.x += dx;
            } else {
              ground = stepFloor(
                navmesh,
                hx,
                hz + dz,
                groundY.current,
                MAX_STEP_UP,
                MAX_STEP_DOWN,
              );

              if (ground != null) {
                p.z += dz;
              } else if (
                stepFloor(
                  navmesh,
                  hx,
                  hz,
                  groundY.current,
                  MAX_STEP_UP,
                  MAX_STEP_DOWN,
                ) == null
              ) {
                /**
                 * WALKING BACK FROM OUTSIDE. Nothing above can succeed here,
                 * and without this the sticks are dead.
                 *
                 * The navmesh only ever gated the STICK. Physical room-scale
                 * walking writes the head pose, never the origin, so it passes
                 * no test at all and can put the player through a wall. Once
                 * the head is off the mesh every branch above fails — a step is
                 * a couple of centimetres, so `hx + dx` is still outside unless
                 * you are on the very edge — and the player is stranded
                 * somewhere they cannot see the venue from, with controls that
                 * appear broken. The only way out was to physically walk back.
                 *
                 * So while outside, allow any step that CLOSES on walkable
                 * ground. Monotonic, therefore it cannot be used to travel:
                 * every accepted step strictly reduces the distance, and the
                 * moment the head is back over the mesh the branches above take
                 * over again.
                 *
                 * The target is sought ON THIS STOREY. Nearest in plan alone is
                 * very often the deck below, so a player who stepped off a
                 * concourse edge would be walked home to the pitch.
                 */
                const target = nearestCentroid(
                  centroids,
                  hx,
                  hz,
                  groundY.current,
                );
                if (target) {
                  // Measured against ONE fixed target, not re-nearest per
                  // position: recomputing could pick a different triangle for
                  // the after-step and report an improvement that is really a
                  // sideways move.
                  const beforeSq = (target.x - hx) ** 2 + (target.z - hz) ** 2;
                  const afterSq =
                    (target.x - (hx + dx)) ** 2 + (target.z - (hz + dz)) ** 2;
                  if (afterSq < beforeSq) {
                    p.x += dx;
                    p.z += dz;
                  }
                }
              }
              // else: cornered on both axes, hold position.
            }
          }
        }

        /**
         * FOLLOW THE FLOOR. The height comes from the step that was accepted,
         * so it is the surface the player was just allowed onto and nothing
         * else — no second sample that could name a different level, and no
         * jump guard, because a step that would have jumped was refused rather
         * than taken and then ignored.
         *
         * Off the mesh (`ground` null) the last known storey stands, which is
         * what lets the walk-back branch above crawl home at a sane height.
         *
         * Eased rather than snapped so a kerb reads as a step rather than a
         * jolt: the eye tolerates the floor arriving over ~100 ms, and a hard
         * snap in a headset is felt in the stomach.
         */
        if (ground != null) groundY.current = ground;

        const settle =
          groundY.current + groundOffset + (standingLiftRef?.current ?? 0) - p.y;
        if (settle !== 0) {
          p.y += settle * (1 - Math.exp(-FLOOR_FOLLOW_RATE * dt));
        }
      }
    }

    // ── Smooth turn — right stick X, pivoting about the HEAD ─────────────────
    // Not the origin: room-scale puts the user a metre off it, and rotating the
    // group alone swings them around an off-body pivot.
    //
    //     newOrigin = head + R(angle) · (origin − head)
    const turn = right?.gamepad?.["xr-standard-thumbstick"];
    const tx = turn?.xAxis ?? 0;

    if (Math.abs(tx) < DEADZONE) return;

    // Rescaled from the deadzone edge, so the turn eases in from a standstill
    // instead of jumping to a fraction of full speed the moment it engages.
    const throttle = (Math.abs(tx) - DEADZONE) / (1 - DEADZONE);

    // Stick right (x > 0) → turn right → clockwise from above → negative Y.
    // Per second, scaled by dt: the rate must not follow the frame rate.
    const angle =
      (tx < 0 ? 1 : -1) * THREE.MathUtils.degToRad(turnSpeed) * throttle * dt;

    state.camera.getWorldPosition(_head);
    _head.y = origin.position.y;

    origin.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
    origin.rotation.y += angle;
  });

  return null;
}
