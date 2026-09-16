/** Data only: safe to import before Three and the scene download. */
import manifest from '@/public/models/casino-dealer-v3.json'
import webManifest from '@/public/models/casino-dealer-v3-web.json'
import compactManifest from '@/public/models/casino-dealer-v3-compact.json'
import meshoptManifest from '@/public/models/casino-dealer-v3-meshopt.json'
import optimizedManifest from '@/public/models/casino-dealer-v3-1mb.json'

// A rebuilt authored model takes precedence until its delivery copy is regenerated.
export const SKELETON_DEALER_URL = optimizedManifest.sourceModel === manifest.model ? optimizedManifest.model
  : meshoptManifest.sourceModel === manifest.model ? meshoptManifest.model
  : compactManifest.sourceModel === manifest.model ? compactManifest.model
  : webManifest.sourceModel === manifest.model ? webManifest.model : manifest.model
export const FOLDER_URL = '/models/resume-folder-meshopt.glb?v=03ec300343c7'
