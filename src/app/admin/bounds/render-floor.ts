'use client';

/**
 * Top-down orthographic renderer for the /admin/bounds tool.
 *
 * Outputs a PNG whose pixel↔world mapping matches the runtime minimap's
 * world→pixel:
 *
 *   pixel (0, 0)   ↔   world (minX, minZ)   — top-left
 *   pixel (W, H)   ↔   world (maxX, maxZ)   — bottom-right
 *
 * That orientation is baked into the camera (`up = -Z`) so the PNG drops
 * straight into a scene's `floorplanUrl`.
 */

import * as THREE from 'three';
import { GLTFLoader, DRACOLoader } from 'three/examples/jsm/Addons.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type RenderMode = 'native' | 'silhouette';

// WebGL/canvas hard cap. Large outdoor models (dx·ppm) easily exceed the
// browser's max drawing-buffer size; without a cap the canvas is silently
// clamped and only PART of the model renders (the "half model" bug). We cap the
// longest side here and downscale the other proportionally so the FULL footprint
// is always captured, just at a lower resolution.
const MAX_DIM = 4096;

export interface FloorBbox {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  dx: number; dy: number; dz: number; cx: number; cz: number;
}

export interface FloorEntry {
  fileName: string;
  scene: THREE.Object3D;
  bbox: FloorBbox;
}

let _draco: DRACOLoader | null = null;
function makeLoader(): GLTFLoader {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  }
  const loader = new GLTFLoader();
  loader.setDRACOLoader(_draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export function computeBbox(scene: THREE.Object3D): FloorBbox {
  const b = new THREE.Box3().setFromObject(scene);
  return {
    minX: b.min.x, maxX: b.max.x,
    minY: b.min.y, maxY: b.max.y,
    minZ: b.min.z, maxZ: b.max.z,
    dx: b.max.x - b.min.x, dy: b.max.y - b.min.y, dz: b.max.z - b.min.z,
    cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2,
  };
}

export async function loadFloorGlb(file: File): Promise<FloorEntry> {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await makeLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    return { fileName: file.name, scene: gltf.scene, bbox: computeBbox(gltf.scene) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pixelDimsFor(bbox: FloorBbox, ppm: number): { w: number; h: number } {
  let w = Math.max(2, Math.round(bbox.dx * ppm));
  let h = Math.max(2, Math.round(bbox.dz * ppm));
  // Cap the longest side so the whole model always fits the drawing buffer.
  const longest = Math.max(w, h);
  if (longest > MAX_DIM) {
    const s = MAX_DIM / longest;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  // Even dimensions (nicer for downstream scaling).
  w = Math.max(2, Math.round(w / 2) * 2);
  h = Math.max(2, Math.round(h / 2) * 2);
  return { w, h };
}

let _renderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (_renderer) return _renderer;
  _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  _renderer.setPixelRatio(1);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Match the runtime scene's tone mapping so the floor-plan colours read the
  // same as in-app, with a touch of extra exposure for a brighter top-down.
  _renderer.toneMapping = THREE.NeutralToneMapping;
  _renderer.toneMappingExposure = 1.15;
  _renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is deprecated in this three build (warns every render);
  // PCFShadowMap is the supported equivalent.
  _renderer.shadowMap.type = THREE.PCFShadowMap;
  return _renderer;
}

function buildSilhouette(src: THREE.Object3D): { root: THREE.Object3D; dispose: () => void } {
  src.updateWorldMatrix(true, true);
  const root = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  const geos: THREE.BufferGeometry[] = [];
  src.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const fill = new THREE.Mesh(m.geometry, fillMat);
    fill.matrixAutoUpdate = false;
    fill.matrix.copy(m.matrixWorld);
    root.add(fill);
    const edges = new THREE.EdgesGeometry(m.geometry, 20);
    geos.push(edges);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.matrixAutoUpdate = false;
    lines.matrix.copy(m.matrixWorld);
    root.add(lines);
  });
  return { root, dispose: () => { fillMat.dispose(); edgeMat.dispose(); geos.forEach((g) => g.dispose()); } };
}

function addLighting(scene: THREE.Scene, bbox: FloorBbox): void {
  // Sky/ground fill + a bright flat ambient so the whole top-down reads evenly
  // (no dark corners), then a soft key + fill for gentle form.
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a3630, 1.0));
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const h = Math.max(bbox.dy * 2, Math.max(bbox.dx, bbox.dz) * 0.8);

  // Straight-down key for crisp, evenly-lit top-down colours.
  const top = new THREE.DirectionalLight(0xffffff, 1.6);
  top.position.set(bbox.cx, bbox.maxY + h, bbox.cz);
  top.target.position.set(bbox.cx, bbox.minY, bbox.cz);
  scene.add(top.target, top);

  const key = new THREE.DirectionalLight(0xfff3e0, 1.4);
  key.position.set(bbox.cx + bbox.dx * 0.6, bbox.maxY + h, bbox.cz + bbox.dz * 0.4);
  key.target.position.set(bbox.cx, bbox.minY, bbox.cz);
  scene.add(key.target, key);

  const fill = new THREE.DirectionalLight(0xcfd8ff, 0.6);
  fill.position.set(bbox.cx - bbox.dx * 0.6, bbox.maxY + h * 0.6, bbox.cz - bbox.dz * 0.4);
  fill.target.position.set(bbox.cx, bbox.minY, bbox.cz);
  scene.add(fill.target, fill);
}

export interface RenderResult {
  /** Transparent PNG cropped exactly to the model's footprint. */
  url: string;
  /** World XZ bounds the cropped image covers — pixel(0,0)=（minX,minZ）,
   *  pixel(W,H)=(maxX,maxZ). Matches the cropped image 1:1 for the minimap. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Cropped pixel dimensions. */
  width: number;
  height: number;
}

export function renderFloorToPng(entry: FloorEntry, pixelW: number, pixelH: number, mode: RenderMode): RenderResult {
  const { scene, bbox } = entry;
  const renderer = getRenderer();
  renderer.setSize(pixelW, pixelH, false);
  renderer.setClearColor(0x000000, 0);

  const renderScene = new THREE.Scene();
  let dispose: () => void = () => {};
  if (mode === 'silhouette') {
    const built = buildSilhouette(scene);
    dispose = built.dispose;
    renderScene.add(built.root);
  } else {
    renderScene.add(scene);
    addLighting(renderScene, bbox);
  }

  // Orthographic frustum = the exact XZ footprint, so the WHOLE model is framed.
  // up = -Z so screen-right = +X (→ maxX) and screen-up = -Z (→ minZ at top):
  // pixel (0,0) = world (minX, minZ), matching the minimap's world→pixel.
  const cam = new THREE.OrthographicCamera(
    -bbox.dx / 2, bbox.dx / 2, bbox.dz / 2, -bbox.dz / 2,
    0.01, bbox.dy + Math.max(bbox.dx, bbox.dz) + 1000,
  );
  // Sit well above the tallest point so nothing is clipped by the near plane.
  cam.position.set(bbox.cx, bbox.maxY + bbox.dy + 50, bbox.cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(bbox.cx, bbox.minY, bbox.cz);

  renderer.render(renderScene, cam);

  // Copy the WebGL frame into a 2D canvas so we can read its alpha and crop the
  // transparent margin away — the image then hugs the model exactly (no padding)
  // and the reported world bounds shrink to match, keeping the minimap mapping
  // pixel-accurate.
  const full = document.createElement('canvas');
  full.width = pixelW;
  full.height = pixelH;
  const fctx = full.getContext('2d')!;
  fctx.drawImage(renderer.domElement, 0, 0);

  if (mode !== 'silhouette') renderScene.remove(scene);
  dispose();

  const { data } = fctx.getImageData(0, 0, pixelW, pixelH);
  let x0 = pixelW, y0 = pixelH, x1 = -1, y1 = -1;
  const ALPHA = 8; // ignore near-invisible antialias fringe
  for (let y = 0; y < pixelH; y++) {
    for (let x = 0; x < pixelW; x++) {
      if (data[(y * pixelW + x) * 4 + 3] > ALPHA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  // Fully transparent (nothing rendered) → fall back to the full frame/bounds.
  if (x1 < x0 || y1 < y0) {
    return {
      url: full.toDataURL('image/png'),
      bounds: { minX: bbox.minX, maxX: bbox.maxX, minZ: bbox.minZ, maxZ: bbox.maxZ },
      width: pixelW, height: pixelH,
    };
  }

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const cropped = document.createElement('canvas');
  cropped.width = cw;
  cropped.height = ch;
  cropped.getContext('2d')!.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);

  // Map the crop rectangle back to world XZ through the (linear) frustum:
  // pixel x ∈ [0, pixelW] → world X ∈ [minX, maxX]; pixel y ∈ [0, pixelH] → Z.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const bounds = {
    minX: lerp(bbox.minX, bbox.maxX, x0 / pixelW),
    maxX: lerp(bbox.minX, bbox.maxX, (x1 + 1) / pixelW),
    minZ: lerp(bbox.minZ, bbox.maxZ, y0 / pixelH),
    maxZ: lerp(bbox.minZ, bbox.maxZ, (y1 + 1) / pixelH),
  };

  return { url: cropped.toDataURL('image/png'), bounds, width: cw, height: ch };
}
