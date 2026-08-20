#!/usr/bin/env node
/**
 * Rebuild a venue GLB for a headset.
 *
 *   node scripts/vr-model-optimize.mjs             # every venue with a recipe
 *   node scripts/vr-model-optimize.mjs memorial    # one of them
 *
 * WHAT "FLICKER" ACTUALLY IS. A headset renders the scene twice against a hard
 * deadline, and a frame that misses it is not shown late — it is not shown at
 * all. The compositor reprojects the previous one instead, and a scene that
 * misses most of its frames strobes, then blacks out. So the fix is never a
 * smaller download, it is fewer draw calls and fewer triangles.
 *
 * MEASURED FIRST. `npm run vr:check` says which of the two is the problem, and
 * it is not the same one per venue:
 *
 *   memorial   2,471 draws (4,942 in stereo)   643k triangles   -> DRAW CALLS
 *   stadium      228 draws                   1,143k triangles   -> TRIANGLES
 *
 * Textures are not the problem in either: 187 images on the memorial come to
 * 1.0 MB of WebP, and 33 on the stadium to 0.4 MB. Neither is position
 * precision — both models are on a sub-millimetre grid, so the flicker is not
 * z-fighting from a coarse quantiser. This script therefore does nothing to
 * textures at all, which is what keeps it lossless where it shows: the pixels
 * are untouched.
 *
 * OUTPUT IS A SEPARATE FILE, and `vr-scenes.json` points at it. The flat site
 * keeps the original — a desktop GPU draws it happily, it is what the lighting
 * and the dollhouse camera were authored against, and one venue looking
 * slightly softer in VR is not worth degrading the site everyone else sees.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  dequantize,
  draco,
  flatten,
  join,
  prune,
  simplify,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One recipe per venue, and the numbers differ because the bottlenecks differ.
 *
 * `simplifyRatio` is the share of triangles to KEEP, and it is the only setting
 * here that can be seen. Everything else is structural — merging meshes that
 * already draw identically — and cannot change a pixel.
 *
 * `simplifyError` is how far a vertex may move — AND IT IS RELATIVE TO THE
 * MESH EXTENT, which after `join` is the extent of the whole venue. That is a
 * trap and it caught this script: 0.003 reads like a small number and on the
 * 656 m stadium it authorised every vertex to move up to TWO METRES. What that
 * looks like is holes — surfaces pulled apart at the seams, which is not what a
 * building does. 0.0001 is 6.6 cm on the stadium and 2.2 cm on the village.
 *
 * `quantizePosition` is bits per axis, and 24 is deliberate — see the note on
 * the Draco pass. Dropping it to 20 costs a few tenths of a millimetre and
 * saves real bytes; it is per-recipe so that is a per-venue decision.
 *
 * `lockBorder` pins every vertex on an open edge. Together with the tight error
 * that is what makes simplification safe here: two shells that meet at a seam
 * both own a border along it, so neither side can move and no gap can open. It
 * also costs most of the reduction — 1,143k to 928k instead of to 685k — and
 * that is the correct trade. A stadium with 30% fewer triangles and gaps in the
 * walls is not a cheaper stadium, it is a broken one.
 */
const RECIPES = {
  village: {
    in: "public/models/olympic-village-v3.glb",
    out: "public/models/olympic-village-v3-vr.glb",
    /**
     * Over on both counts — 302 draws and 1,270k triangles, the heaviest
     * geometry of the four — so it gets both passes.
     */
    simplifyRatio: 0.3,
    simplifyError: 0.005,
    lockBorder: true,
    dropNormals: true,
    quantizePosition: 24,
  },
  /**
   * NO MEMORIAL RECIPE, and its absence is deliberate rather than an oversight.
   *
   * It had one, and it worked: 2,471 draw calls merged to 201 with an identical
   * triangle count, material for material. VR nonetheless loads the same
   * `memorial-v4.glb` the flat site draws, because that is what was asked for —
   * so this venue keeps the original and the draw calls that come with it.
   *
   * The entry stays out rather than being commented back in with `simplifyRatio:
   * 1`, because a recipe of any kind writes a `model` override into
   * `vr-scenes.json`, and the point is that running this script cannot quietly
   * put the venue back on a rebuilt file.
   */
  stadium: {
    in: "public/models/stadium/sofi-stadium-v5-web.glb",
    out: "public/models/stadium/sofi-stadium-v5-web-vr.glb",
    /**
     * 1,143k triangles is 2,286k per frame in stereo against a 1,000k ceiling,
     * so this one has to lose geometry. 0.45 aims just under 500k — the target
     * rather than the ceiling, because the budget is what the venue costs
     * before a single panel or marker is drawn on top of it.
     */
    simplifyRatio: 0.3,
    simplifyError: 0.005,
    lockBorder: true,
    dropNormals: true,
    quantizePosition: 24,
  },
};

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const VR_SCENES = path.join(ROOT, "src/components/vr/data/vr-scenes.json");

/**
 * Point a venue at its freshly built model.
 *
 * Edited as TEXT rather than parsed and re-serialised, because that file is
 * more comment than config — every key has a `//key` above it explaining what
 * it is for, and `JSON.parse` followed by `JSON.stringify` would keep all of
 * them while destroying the formatting that makes them readable.
 */
function writeVenueModel(venue, url) {
  const text = fs.readFileSync(VR_SCENES, "utf8");

  const at = text.indexOf(`"${venue}": {`);
  const key = at < 0 ? -1 : text.indexOf('"model":', at);
  const open = key < 0 ? -1 : text.indexOf('"', key + 8);
  const close = open < 0 ? -1 : text.indexOf('"', open + 1);

  if (close < 0) {
    console.warn(`  ! no "model" entry for ${venue} in vr-scenes.json; set it to ${url}`);
    return;
  }

  fs.writeFileSync(VR_SCENES, text.slice(0, open + 1) + url + text.slice(close));
}

/** Draw calls and triangles as a headset meets them: one per node, not per mesh. */
function census(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let draws = 0;
  let triangles = 0;

  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        draws++;
        const indices = prim.getIndices();
        const count = indices
          ? indices.getCount()
          : (prim.getAttribute("POSITION")?.getCount() ?? 0);
        triangles += count / 3;
      }
    }
    for (const child of node.listChildren()) visit(child);
  };

  for (const node of scene.listChildren()) visit(node);
  return { draws, triangles: Math.round(triangles) };
}

async function optimize(name, recipe, io) {
  const input = path.resolve(ROOT, recipe.in);

  const before = fs.statSync(input).size;
  const document = await io.read(input);
  const was = census(document);

  await document.transform(
    // Identical accessors, materials and textures authored more than once.
    // Nothing downstream can merge two meshes holding equal-but-distinct
    // materials, so this runs first and everything after it benefits.
    dedup(),

    /**
     * Undo KHR_mesh_quantization before anything bakes a transform.
     *
     * Quantized positions are integers whose meaning comes from a scale on the
     * node above them. `join` writes node transforms into vertex data, so with
     * the integers still in place it would be baking a transform into numbers
     * that already depend on one. Re-encoded at the end by Draco, which carries
     * its own quantiser.
     */
    dequantize(),

    /**
     * DROP NORMALS — the pass that makes simplification possible at all, not a
     * size saving.
     *
     * `weld` merges vertices that are BITWISE identical, so two triangles
     * meeting at an edge only share vertices if every attribute agrees. A
     * building exported flat-shaded gives each face its own normals, so no
     * vertex is ever shared, and a simplifier that works by collapsing edges
     * has no edges to collapse. Measured on the stadium: 1,710k vertices for
     * 1,143k triangles — half as many again as the geometry needs — and the
     * simplifier could not get past -18% however far the error was opened.
     * Without normals the same weld drops it to 1,158k and the collapse works.
     *
     * IT IS INVISIBLE HERE, and only here. The VR scene is lit by a single
     * `ambientLight` and nothing else (see `experience/index.tsx`, which
     * explains why a sun is unaffordable at this scale): ambient light is not a
     * function of the surface normal, there is no environment map, and one of
     * the stadium's 64 materials carries a normal map. glTF requires a client
     * to compute flat normals when they are absent, and three does it by
     * setting `flatShading`, which reconstructs them per-face in the shader.
     *
     * ADD A DIRECTIONAL LIGHT TO THE VR SCENE AND THIS BECOMES VISIBLE. That is
     * the trade, written down.
     */
    ...(recipe.dropNormals
      ? [
          (document) => {
            for (const mesh of document.getRoot().listMeshes()) {
              for (const prim of mesh.listPrimitives()) {
                prim.setAttribute("NORMAL", null);
                // Meaningless without a normal to be tangent to.
                prim.setAttribute("TANGENT", null);
              }
            }
          },
        ]
      : []),

    // Indexed, de-duplicated vertices. Required by `simplify`.
    weld(),

    /**
     * SIMPLIFY BEFORE JOINING, and the order is the whole difference between a
     * usable model and a broken one.
     *
     * `error` is relative to the extent of the mesh being simplified. Run after
     * `join`, a "mesh" is every surface in the venue that shares a material, so
     * its extent is the venue: 0.003 on the 656 m stadium authorised every
     * vertex to move up to TWO METRES, and what that looks like is holes. Run
     * before, each mesh is one object a few metres across and the same fraction
     * is a couple of centimetres.
     *
     * It also works far better, because the budget is spent per object instead
     * of being averaged over the whole building. Measured, at the same error:
     *
     *   village   after join 967k triangles      before join 358k
     *   stadium   after join 928k                before join 680k
     *
     * `lockBorder` then pins every vertex on an open edge, so each object keeps
     * its own outline exactly and no gap can open where two of them meet.
     */
    ...(recipe.simplifyRatio < 1
      ? [
          simplify({
            simplifier: MeshoptSimplifier,
            ratio: recipe.simplifyRatio,
            error: recipe.simplifyError,
            lockBorder: recipe.lockBorder,
          }),
        ]
      : []),

    // `join` can only merge siblings, so the hierarchy is collapsed first.
    flatten(),

    /**
     * THE ONE THAT KILLS DRAW CALLS. Merge every mesh sharing a material into a
     * single primitive, baking each one's world transform into its vertices.
     *
     * Same geometry, same materials, same positions — the picture is identical
     * and the draw-call count falls to the number of distinct materials, which
     * is the floor for any scene whose materials are not themselves merged.
     * `keepNamed: false` because a name is the only thing standing between a
     * mesh and its neighbour here, and nothing in VR reads them.
     */
    join({ keepNamed: false }),

    // Whatever the passes above orphaned.
    prune(),

    /**
     * Re-encode at 24 BITS OF POSITION, not the 14 or 16 that is usual, and
     * that is a direct consequence of joining.
     *
     * A quantiser spreads its grid over the extent of what it is encoding, so
     * the same bit depth is fine grained on a doorframe and coarse on a
     * stadium. The originals are 16-bit and their MEDIAN primitive lands on a
     * 0.05 mm grid, because a primitive there is one small object. `join`
     * merges those objects into venue-sized primitives — after which 16 bits is
     * a 1.9 mm median and 15 mm at worst, so two surfaces that met exactly now
     * land on grid points millimetres apart. Seams open. Coplanar faces fight.
     *
     * 24 bits puts the whole venue back on a 0.06 mm grid, finer than anything
     * in the source. `"mesh"` rather than `"scene"` so each primitive still
     * gets a volume no larger than it needs.
     */
    draco({
      quantizePosition: recipe.quantizePosition ?? 24,
      quantizationVolume: "mesh",
    }),
  );

  /**
   * THE FILENAME CARRIES A HASH OF THE BYTES, and that is not tidiness.
   *
   * Writing a rebuilt model back to the same URL is a silent trap: a headset
   * browser that already downloaded the previous one has no reason to ask for
   * it again, so a venue goes on showing a build that was replaced — including
   * the broken one you are trying to fix. There is no way to tell that from
   * inside the headset; the model simply stays wrong.
   *
   * A content hash makes the URL change whenever the bytes do, so a stale copy
   * is unreachable rather than merely unlikely. `vr-scenes.json` is rewritten
   * to match, and the previous build for this venue is deleted so the folder
   * does not accumulate one file per attempt.
   */
  const bytes = await io.writeBinary(document);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);

  const dir = path.dirname(path.resolve(ROOT, recipe.out));
  const base = path.basename(recipe.out, ".glb");
  // `<base>.<8 hex>.glb` — a previous build of this same venue.
  const isStale = (f) =>
    f.startsWith(base + ".") &&
    f.endsWith(".glb") &&
    /^[0-9a-f]{8}$/.test(f.slice(base.length + 1, -4));
  for (const f of fs.readdirSync(dir)) {
    if (isStale(f)) fs.rmSync(path.join(dir, f));
  }

  const output = path.join(dir, `${base}.${hash}.glb`);
  fs.writeFileSync(output, bytes);

  /** The path as the browser asks for it — `public/` is the web root. */
  const url = "/" + path.relative(path.join(ROOT, "public"), output).split(path.sep).join("/");
  writeVenueModel(name, url);

  const after = fs.statSync(output).size;
  const now = census(document);

  const pct = (from, to) =>
    from === 0
      ? ""
      : ` (${to > from ? "+" : ""}${Math.round(((to - from) / from) * 100)}%)`;

  const pad = (n) => String(n).padStart(7);

  console.log(`\n${name}`);
  console.log(`  ${recipe.in}`);
  console.log(`  -> ${path.relative(ROOT, output).split(path.sep).join("/")}`);
  console.log(
    `  draw calls  ${pad(was.draws)} -> ${pad(now.draws)}${pct(was.draws, now.draws)}`,
  );
  console.log(
    `  triangles   ${pad(was.triangles)} -> ${pad(now.triangles)}${pct(was.triangles, now.triangles)}`,
  );
  console.log(
    `  file size  ${mb(before).padStart(8)} -> ${mb(after).padStart(8)}${pct(before, after)}`,
  );
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

await MeshoptSimplifier.ready;

const argv = process.argv.slice(2);

/**
 * `--ratio` / `--error` override the recipe for this run only.
 *
 * Simplification is the one setting here whose right value is a judgement about
 * how the building looks, not a number that can be derived — so it has to be
 * possible to try one, put the headset on, and try another, without editing the
 * file between attempts. Whatever survives that goes back into the recipe.
 */
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? Number(argv[at + 1]) : null;
};
const ratioFlag = flag("--ratio");
const errorFlag = flag("--error");
const lockFlag = flag("--lock");

const wanted = argv.filter(
  (a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"),
);
const names = wanted.length > 0 ? wanted : Object.keys(RECIPES);

for (const name of names) {
  const base = RECIPES[name];
  const recipe = base && {
    ...base,
    simplifyRatio: ratioFlag ?? base.simplifyRatio,
    simplifyError: errorFlag ?? base.simplifyError,
    lockBorder: lockFlag == null ? base.lockBorder : lockFlag === 1,
  };
  if (!recipe) {
    console.error(
      `no recipe for "${name}" — have: ${Object.keys(RECIPES).join(", ")}`,
    );
    process.exitCode = 1;
    continue;
  }
  await optimize(name, recipe, io);
}

console.log(
  "\nNow check them against the budget AND against the original's coordinates:",
);
for (const name of names) {
  const r = RECIPES[name];
  if (r) {
    console.log(`  node scripts/vr-model-check.mjs ${r.out} --against ${r.in}`);
  }
}
