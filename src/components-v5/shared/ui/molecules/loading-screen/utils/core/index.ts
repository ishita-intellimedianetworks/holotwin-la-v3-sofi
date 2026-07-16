// Framework-agnostic Three.js bits.
export { loadPreviewBin, parsePreviewBin, mergePreviews } from './previewLoader';
export type { PreviewBin } from './previewLoader';

export {
  HoloTwinPreview,
  createSharedUniforms,
  getSharedUniforms,
  resetSharedUniforms,
} from './HoloTwinPreview';
export type { SharedUniforms } from './HoloTwinPreview';

export { patchMeshForReveal } from './patchMeshForReveal';

export { crossfadeReveal, smoothstep, smootherstep } from './crossfadeReveal';
export type { CrossfadeOptions } from './crossfadeReveal';
