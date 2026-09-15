export type Landmark = { x: number; y: number; z: number; visibility?: number }
export type CaptureFrame = {
  pose: Landmark[]; face: Landmark[]; leftHand: Landmark[]; rightHand: Landmark[]
  expressions: Record<string, number>; aspect: number
}
export type PoseSample = { time: number; bones: Record<string, number[]>; expressions: Record<string, number>; scales?: Record<string, number[]> }
export type MotionTake = { version: 1; model: 'casino-dealer-v2' | 'casino-dealer-v3'; name: string; duration: number; frames: PoseSample[] }
export type CaptureMode = 'idle' | 'live' | 'recording' | 'playback'
export type MotionSession = {
  mode: CaptureMode
  frame: CaptureFrame | null
  receivedAt: number
  smoothing: number
  calibrate: number
  take: MotionTake | null
  playhead: number
  playing: boolean
  recordStart: number
  samples: PoseSample[]
}

export function newSession(): MotionSession {
  return { mode: 'idle', frame: null, receivedAt: 0, smoothing: .12, calibrate: 0,
    take: null, playhead: 0, playing: false, recordStart: 0, samples: [] }
}
