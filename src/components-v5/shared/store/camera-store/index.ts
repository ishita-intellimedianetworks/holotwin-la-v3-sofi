import { create } from "zustand";
import * as THREE from "three";

// Interior camera FOV — applied to the live camera once it binds (see
// CameraStoreBinder in scene-content).
export const FOV_DEFAULT = 50;

const applyFovToCamera = (cam: THREE.Camera | null, fov: number) => {
  if (!cam) return;
  const perspective = cam as THREE.PerspectiveCamera;
  if (typeof perspective.fov === "number" && typeof perspective.updateProjectionMatrix === "function") {
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
  }
};

interface CameraState {
  /** Live Three.js camera ref — set by CameraStoreBinder on mount. */
  cameraRef: THREE.Camera | null;
  setCameraRef: (cam: THREE.Camera) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameraRef: null,
  setCameraRef: (cam) => {
    set({ cameraRef: cam });
    applyFovToCamera(cam, FOV_DEFAULT);
  },
}));
