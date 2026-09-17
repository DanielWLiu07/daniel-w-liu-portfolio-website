import { Quaternion, Vector3 } from 'three'

/** Compact baked rigid poses. Positions use clip bounds; quaternion components
 * use signed 16-bit values. Only two samples are decoded per rendered card. */
export class PaperRecording {
  readonly count: number
  readonly fps: number
  readonly frames: number
  readonly duration: number
  readonly sizes: Vector3[]
  private bounds: number[]
  private data: DataView
  private offset: number
  private p = new Vector3()
  private q = new Quaternion()
  constructor(buffer: ArrayBuffer) {
    this.data = new DataView(buffer)
    if (this.data.getUint32(0, true) !== 0x324b4250) throw new Error('Invalid paper recording')
    this.count = this.data.getUint16(4, true); this.fps = this.data.getUint16(6, true); this.frames = this.data.getUint32(8, true)
    this.duration = (this.frames - 1) / this.fps
    this.bounds = Array.from({ length: 6 }, (_, i) => this.data.getFloat32(12 + i * 4, true))
    this.sizes = Array.from({ length: this.count }, (_, i) => new Vector3(...[0, 1, 2].map(j => this.data.getFloat32(36 + i * 12 + j * 4, true)) as [number, number, number]))
    this.offset = 36 + this.count * 12
    if (!this.fps || this.frames < 2 || buffer.byteLength !== this.offset + this.count * this.frames * 14) throw new Error('Incomplete paper recording')
    // Second differences grouped by channel compress smoothly changing motion.
    // Expand once; frame playback still reads fixed-size absolute samples.
    const decoded = new DataView(new ArrayBuffer(this.count * this.frames * 14))
    for (let body = 0; body < this.count; body++) for (let channel = 0; channel < 7; channel++) {
      let value = 0, delta = 0
      for (let frame = 0; frame < this.frames; frame++) {
        delta = (delta + this.data.getInt16(this.offset + ((body * 7 + channel) * this.frames + frame) * 2, true)) & 65535
        value = (value + delta) & 65535
        decoded.setUint16((body * this.frames + frame) * 14 + channel * 2, value, true)
      }
    }
    this.data = decoded; this.offset = 0
  }
  private read(body: number, frame: number, p: Vector3, q: Quaternion) {
    const at = this.offset + (body * this.frames + frame) * 14
    p.set(this.bounds[0] + this.data.getUint16(at, true) / 65535 * (this.bounds[3] - this.bounds[0]),
      this.bounds[1] + this.data.getUint16(at + 2, true) / 65535 * (this.bounds[4] - this.bounds[1]),
      this.bounds[2] + this.data.getUint16(at + 4, true) / 65535 * (this.bounds[5] - this.bounds[2]))
    q.set(this.data.getInt16(at + 6, true) / 32767, this.data.getInt16(at + 8, true) / 32767,
      this.data.getInt16(at + 10, true) / 32767, this.data.getInt16(at + 12, true) / 32767).normalize()
  }
  sample(body: number, time: number, p: Vector3, q: Quaternion) {
    if (body < 0 || body >= this.count) throw new Error('Unknown recorded card')
    const frame = Math.max(0, Math.min(this.frames - 1, time * this.fps)), lower = Math.floor(frame)
    this.read(body, lower, p, q)
    this.read(body, Math.min(lower + 1, this.frames - 1), this.p, this.q)
    p.lerp(this.p, frame - lower); q.slerp(this.q, frame - lower)
  }
}

const recordings = new Map<string, Promise<PaperRecording>>()
export function loadPaperRecording(portrait: boolean): Promise<PaperRecording | undefined> {
  // Offline capture needs the authored wall rather than yesterday's recording.
  // This switch is local-only and is never honored on a deployed site.
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).has('paperBake')) return Promise.resolve(undefined)
  const url = `/animations/paper-${portrait ? 'portrait' : 'desktop'}-v1.bin.gz`
  let pending = recordings.get(url)
  if (!pending) {
    pending = fetch(url).then(async response => {
      if (!response.ok || !response.body) throw new Error(`Cannot load paper animation: ${response.status}`)
      const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      return new PaperRecording(buffer)
    }).catch(error => { recordings.delete(url); throw error })
    recordings.set(url, pending)
  }
  return pending
}
