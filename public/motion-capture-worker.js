/* global Vision */
// Classic worker: MediaPipe's WASM loader uses importScripts. One frame in flight.
let tracker
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      importScripts('/api/motion-runtime/vision_bundle.js')
      const files = await Vision.FilesetResolver.forVisionTasks('/api/motion-runtime')
      tracker = await Vision.HolisticLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        outputFaceBlendshapes: true,
        outputPoseSegmentationMasks: false,
      })
      self.postMessage({ type: 'ready' })
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) })
    }
  } else if (data.type === 'frame') {
    try {
      if (!tracker) throw new Error('Tracker is not ready')
      const result = tracker.detectForVideo(data.bitmap, data.time)
      self.postMessage({ type: 'result', time: data.time, frame: {
        pose: result.poseWorldLandmarks[0] ?? [],
        face: result.faceLandmarks[0] ?? [],
        leftHand: result.leftHandWorldLandmarks[0] ?? [],
        rightHand: result.rightHandWorldLandmarks[0] ?? [],
        expressions: Object.fromEntries((result.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score])),
        aspect: data.width / data.height,
      } })
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) })
    } finally {
      data.bitmap.close()
    }
  }
}
