#!/usr/bin/env node
/**
 * Check a GLB against the VR budget, before it is ever put on a headset.
 *
 *   node scripts/vr-model-check.mjs                    # every venue in scenes.json
 *   node scripts/vr-model-check.mjs path/to/model.glb  # one candidate
 *   node scripts/vr-model-check.mjs cand.glb --against public/models/x.glb
 *
 * WHY THIS EXISTS. Three optimisation passes on the memorial cut its file size
 * in half and its triangles by 48% while moving its draw calls by FOUR, because
 * mesh compressors do not touch scene structure and scene structure is what
 * costs. Nobody could see that from the file size, which is the only number a
 * compressor reports. This prints the number that actually decides whether a
 * headset can draw the thing.
 *
 * THE BINDING CONSTRAINT IS DRAW CALLS, not polygons. A standalone headset
 * renders the scene twice — once per eye — against a 72 Hz deadline, and each
 * draw call is a CPU submit. Miss the deadline in WebXR and you do not get a
 * slow frame, you get NO frame: the compositor reprojects or shows nothing,
 * which is what "the VR scene blacks out" looks like from the inside.
 *
 * Reads the glTF JSON only — no decoding, no dependencies, runs in a second on
 * a Draco-compressed file.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Per eye. The scene is drawn twice a frame, so the real cost is double.
 *
 * These are Quest-2/3-class figures. `ceiling` is where it stops working
 * rather than merely running warm.
 */
const BUDGET = {
  drawCalls: { target: 200, ceiling: 300 },
  triangles: { target: 500_000, ceiling: 1_000_000 },
  materials: { target: 30, ceiling: 60 },
  images: { target: 20, ceiling: 40 },
  bytes: { target: 8 * 1048576, ceiling: 16 * 1048576 },
};

// ── glTF plumbing ───────────────────────────────────────────────────────────

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB file");
  const jsonLen = b.readUInt32LE(12);
  return {
    json: JSON.parse(b.slice(20, 20 + jsonLen).toString("utf8")),
    bytes: b.length,
  };
}

const mulMat = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0];
  const r = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

const applyMat = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/**
 * glTF stores compressed positions as NORMALIZED integers: the real value is
 * `raw / denominator`. Skipping this reads a stadium as thirteen million metres
 * wide and makes every bounds comparison meaningless.
 */
const NORMALIZED_DENOMINATOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function analyze(file) {
  const { json, bytes } = readGlb(file);

  let drawCalls = 0;
  let triangles = 0;
  let vertices = 0;
  let instancedNodes = 0;
  let instancedCopies = 0;

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];

  /**
   * How many draws a runtime instancer could collapse this to.
   *
   * A renderer submits once per (geometry, material) pair, so grouping by that
   * is exactly what `InstancedMesh` can merge. The count of DISTINCT pairs is
   * the floor instancing can reach — and it is bounded below by the material
   * count, which is why material consolidation is the only route past it.
   */
  const groups = new Map();

  const walk = (index, parent) => {
    const n = json.nodes?.[index];
    if (!n) return;
    const world = mulMat(parent, nodeMatrix(n));

    if (n.mesh != null) {
      const instancing = n.extensions?.EXT_mesh_gpu_instancing;
      const copies = instancing
        ? json.accessors[Object.values(instancing.attributes)[0]].count
        : 1;
      if (instancing) {
        instancedNodes++;
        instancedCopies += copies;
      }

      for (const [i, prim] of json.meshes[n.mesh].primitives.entries()) {
        drawCalls += 1;
        groups.set(
          `${n.mesh}:${i}:${prim.material ?? "none"}`,
          (groups.get(`${n.mesh}:${i}:${prim.material ?? "none"}`) ?? 0) + 1,
        );

        const pos = json.accessors[prim.attributes.POSITION];
        const idx = prim.indices != null ? json.accessors[prim.indices].count : null;
        triangles += ((idx ?? pos.count) / 3) * copies;
        vertices += pos.count;

        if (pos.min) {
          const d = pos.normalized
            ? NORMALIZED_DENOMINATOR[pos.componentType] ?? 1
            : 1;
          const mn = pos.min.map((v) => v / d);
          const mx = pos.max.map((v) => v / d);
          for (const c of [
            [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1],
            [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1],
          ]) {
            const p = applyMat(
              world,
              c[0] ? mx[0] : mn[0],
              c[1] ? mx[1] : mn[1],
              c[2] ? mx[2] : mn[2],
            );
            for (let k = 0; k < 3; k++) {
              if (p[k] < lo[k]) lo[k] = p[k];
              if (p[k] > hi[k]) hi[k] = p[k];
            }
          }
        }
      }
    }

    for (const c of n.children ?? []) walk(c, world);
  };

  for (const r of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(r, IDENTITY);

  let textureBytes = 0;
  for (const im of json.images ?? [])
    if (im.bufferView != null)
      textureBytes += json.bufferViews[im.bufferView].byteLength || 0;

  return {
    bytes,
    drawCalls,
    triangles: Math.round(triangles),
    vertices,
    materials: (json.materials ?? []).length,
    images: (json.images ?? []).length,
    textureBytes,
    nodes: (json.nodes ?? []).length,
    instancedNodes,
    instancedCopies,
    instancedFloor: groups.size,
    lo,
    hi,
    required: json.extensionsRequired ?? [],
  };
}

// ── reporting ───────────────────────────────────────────────────────────────

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const kilo = (n) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n));

let failed = false;

function verdict(value, { target, ceiling }) {
  if (value <= target) return { tag: "PASS", ok: true };
  if (value <= ceiling) return { tag: "WARN", ok: true };
  failed = true;
  return { tag: "FAIL", ok: false };
}

function report(label, file, a, baseline) {
  console.log(`\n${"─".repeat(78)}\n${label}\n  ${file}`);

  const line = (name, value, shown, budget) => {
    const v = verdict(value, budget);
    const target =
      budget === BUDGET.bytes ? mb(budget.target) : kilo(budget.target);
    console.log(
      `  ${name.padEnd(14)}${String(shown).padStart(10)}   ${v.tag.padEnd(5)} target <= ${target}`,
    );
  };

  line("draw calls", a.drawCalls, a.drawCalls, BUDGET.drawCalls);
  line("triangles", a.triangles, kilo(a.triangles), BUDGET.triangles);
  line("materials", a.materials, a.materials, BUDGET.materials);
  line("images", a.images, a.images, BUDGET.images);
  line("file size", a.bytes, mb(a.bytes), BUDGET.bytes);
  console.log(
    `  ${"vertices".padEnd(14)}${kilo(a.vertices).padStart(10)}`,
  );

  console.log(
    `\n  per frame in stereo: ${a.drawCalls * 2} draw calls, ${kilo(a.triangles * 2)} triangles`,
  );

  // What instancing could do, and what it could not.
  if (a.instancedNodes === 0 && a.instancedFloor < a.drawCalls) {
    const saved = a.drawCalls - a.instancedFloor;
    console.log(
      `\n  instancing: not used. Collapsing repeats would give ~${a.instancedFloor} draws` +
        ` (${saved} fewer, ${Math.round((saved / a.drawCalls) * 100)}%).`,
    );
    if (a.instancedFloor > BUDGET.drawCalls.ceiling) {
      console.log(
        `              STILL over budget after that — the floor is set by ${a.materials} materials.` +
          `\n              Only merging materials gets past it.`,
      );
    }
  } else if (a.instancedNodes > 0) {
    console.log(
      `\n  instancing: ${a.instancedCopies} copies drawn from ${a.instancedNodes} instanced nodes.`,
    );
  }

  if (a.required.length) {
    console.log(`  requires: ${a.required.join(", ")}`);
  }

  if (baseline) {
    /**
     * OUTWARD GROWTH ONLY, and the asymmetry is the whole point.
     *
     * These bounds are the union of each primitive's AABB with its node's
     * transform applied to the eight corners — the only box readable without
     * decoding Draco, and a LOOSE one wherever a node is rotated, because the
     * rotated corners of an axis-aligned box enclose more than the geometry
     * does. The village has buildings placed at angles and its box is 6.6 m
     * wider than its vertices; the memorial and the stadium are axis-aligned
     * and theirs are exact.
     *
     * So a rebuild that bakes transforms into vertices legitimately reports a
     * SMALLER box than the original — the slack is gone, not the geometry. Read
     * symmetrically that shrinkage looked like 14 m of drift on the village and
     * condemned a build whose vertices had moved half a metre.
     *
     * Growing is the direction that cannot be explained away: geometry outside
     * where it used to be is geometry that moved.
     */
    let drift = 0;
    for (let i = 0; i < 3; i++) {
      drift = Math.max(
        drift,
        baseline.lo[i] - a.lo[i],
        a.hi[i] - baseline.hi[i],
      );
    }
    const ok = drift < 0.5;
    if (!ok) failed = true;
    console.log(
      `\n  coordinates vs baseline: ${drift.toFixed(3)} m drift — ` +
        (ok
          ? "OK, spawns and floor plan still line up"
          : "CHANGED. Spawns, navmesh alignment and the floor-plan marker will all be wrong."),
    );
  }
}

// ── entry ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const againstAt = args.indexOf("--against");
const baselineFile = againstAt >= 0 ? args[againstAt + 1] : null;
// `againstAt + 1` is 0 when there is no `--against`, which silently ate the
// first file argument — `vr-model-check.mjs cand.glb` reported every venue in
// scenes.json instead of the candidate. Only skip that slot when the flag is
// actually present.
const targets = args.filter(
  (a, i) => !a.startsWith("--") && (againstAt < 0 || i !== againstAt + 1),
);

const baseline = baselineFile ? analyze(path.resolve(ROOT, baselineFile)) : null;

if (targets.length > 0) {
  for (const t of targets) {
    const file = path.resolve(ROOT, t);
    report(path.basename(file), file, analyze(file), baseline);
  }
} else {
  // Every venue VR actually loads.
  const scenes = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "src/components-v5/shared/data/scenes.json"),
      "utf8",
    ),
  );
  const vr = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "src/components/vr/data/vr-scenes.json"),
      "utf8",
    ),
  );

  for (const s of scenes.scenes) {
    if (s.dollhouseOnly || !s.navmeshUrl) continue;
    if (vr.venues?.[s.key]?.hidden) continue;

    /**
     * THE VR OVERRIDE WINS, because it is what a headset downloads.
     *
     * `scenes.json` names the model the flat site draws. Where a venue has been
     * rebuilt for VR by `npm run vr:optimize`, `vr-scenes.json` points at that
     * copy instead, and grading the flat one here grades a file nothing loads:
     * it went on reporting the memorial at 2,471 draw calls long after VR had
     * stopped loading the model that submits them.
     */
    const url = vr.venues?.[s.key]?.model ?? vr.defaults?.model ?? s.url;
    const rebuilt = url !== s.url;

    const file = path.join(ROOT, "public", url);
    if (!fs.existsSync(file)) {
      console.log(`
${s.key}: MISSING ${url}`);
      failed = true;
      continue;
    }

    // The flat model is the baseline for a rebuild, so a pass that moved the
    // building shows up here rather than under a headset.
    const flat = path.join(ROOT, "public", s.url);
    const against = rebuilt && fs.existsSync(flat) ? analyze(flat) : null;

    report(
      `${s.key} — ${s.label}${rebuilt ? "  [VR build]" : ""}`,
      file,
      analyze(file),
      against,
    );
  }
}

console.log(`\n${"─".repeat(78)}`);
console.log(
  failed
    ? "RESULT: over budget. A headset may drop frames or black out.\n"
    : "RESULT: within budget.\n",
);
process.exit(failed ? 1 : 0);
