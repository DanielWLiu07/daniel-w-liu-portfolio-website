'use client'

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { Group } from 'three'
import manifest from '@/public/models/casino-dealer-v3.json'
import { DealerRetargeter } from './retarget'
import { downloadMotion, parseTake, sampleTake, takeClip } from './takes'
import { newSession, type MotionSession, type MotionTake } from './types'
import { useWebcam } from './use-webcam'
import { MOTION_CHANNEL, sceneMotionActive } from './scene-bridge'

function MotionActor({ session, onReady, onFinished, channel, sendScene }: {
  session: RefObject<MotionSession>; onReady: (rig: DealerRetargeter | null) => void
  onFinished: () => void; channel: RefObject<BroadcastChannel | null>; sendScene: boolean
}) {
  const { scene } = useGLTF(manifest.model)
  const model = useMemo(() => clone(scene), [scene])
  const modelRef = useRef<Group>(null)
  const rig = useRef<DealerRetargeter | null>(null)
  const sessionRef = useRef(session)
  const calibration = useRef(0)
  const lastSent = useRef(0)
  const lastPlayhead = useRef(session.current.playhead)
  const lastScrubAt = useRef(-Infinity)
  const wasDriving = useRef(false)
  useLayoutEffect(() => {
    rig.current = new DealerRetargeter(modelRef.current!)
    onReady(rig.current)
    return () => { onReady(null); rig.current = null }
  }, [model, onReady])
  useFrame((_, dt) => {
    const r = rig.current, s = sessionRef.current.current, now = performance.now()
    if (!r) return
    if (s.mode === 'playback' && s.take) {
      if (s.playing) s.playhead = (s.playhead + Math.min(dt, .1)) % s.take.duration
      r.apply(sampleTake(s.take, s.playhead))
    } else {
      const frame = now - s.receivedAt < 500 && (s.mode === 'live' || s.mode === 'recording') ? s.frame : null
      if (s.calibrate !== calibration.current && frame && r.calibrate(frame)) calibration.current = s.calibrate
      r.update(frame, dt, s.smoothing)
    }
    if (s.mode === 'recording') {
      const time = (now - s.recordStart) / 1000
      const last = s.samples.at(-1)
      if (!last || time - last.time >= 1/24) {
        const sample = r.sample(s.samples.length ? time : 0)
        s.samples.push(sample)
      }
      if (time >= 30) onFinished()
    }
    if(s.mode==='playback' && !s.playing && s.playhead!==lastPlayhead.current) lastScrubAt.current=now
    lastPlayhead.current=s.playhead
    const driving=sendScene && sceneMotionActive(s,now,lastScrubAt.current)
    if (driving && now - lastSent.current >= 1000/24) {
      channel.current?.postMessage({ type: 'pose', sample: r.sample(now / 1000) })
      lastSent.current = now
      wasDriving.current=true
    } else if(!driving && wasDriving.current) {
      channel.current?.postMessage({type:'stop'})
      wasDriving.current=false
    }
  })
  return <primitive ref={modelRef} object={model} dispose={null} />
}

let lastTake: MotionTake | null = null

const button = 'rounded border border-neutral-600 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'

/** A custom tool module: camera, local inference, preview and reusable takes. */
export default function MotionModule() {
  const session = useRef<MotionSession>({ ...newSession(), take: lastTake, mode: lastTake ? 'playback' : 'idle' })
  const rig = useRef<DealerRetargeter | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState(lastTake ? 'playback' : 'idle')
  const [take, setTake] = useState<MotionTake | null>(lastTake)
  const [note, setNote] = useState('')
  const [smoothing, setSmoothing] = useState(.12)
  const [sendScene, setSendScene] = useState(true)
  const [playhead, setPlayhead] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [calibrated, setCalibrated] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const { video, status, phase, tracking, start, stop } = useWebcam(session)
  const onReady = useCallback((value: DealerRetargeter | null) => { rig.current = value; setReady(!!value) }, [])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const c = new BroadcastChannel(MOTION_CHANNEL)
    channel.current = c
    return () => { c.postMessage({ type: 'stop' }); c.close(); channel.current = null }
  }, [])
  useEffect(() => {
    const timer = setInterval(() => {
      const s = session.current
      setPlayhead(s.mode === 'recording' ? (performance.now() - s.recordStart) / 1000 : s.playhead)
    }, 100)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => () => {
    const s = session.current
    if (s.mode === 'recording' && s.samples.length >= 2) {
      lastTake = { version: 1, model: 'casino-dealer-v3', name: 'Interrupted take', duration: s.samples.at(-1)!.time, frames: s.samples }
    }
  }, [])
  const finish = useCallback(() => {
    const s = session.current
    if (s.mode !== 'recording') return
    if (s.samples.length >= 2) {
      const next: MotionTake = { version: 1, model: 'casino-dealer-v3', name: `Dealer take ${new Date().toLocaleTimeString()}`, duration: s.samples.at(-1)!.time, frames: s.samples }
      lastTake = next; s.take = next; setTake(next); s.mode = 'playback'; s.playhead = 0; s.playing = false
      setMode('playback'); setNote('Take ready. Replay, scrub or export it before closing the tool.')
    } else { s.mode = 'live'; setMode('live'); setNote('Record a little longer to create a take.') }
    s.samples = []
  }, [])
  useEffect(() => {
    if (phase === 'off' && session.current.mode === 'recording') finish()
  }, [phase, finish])
  const cameraOff = () => {
    finish(); stop()
    const s = session.current
    s.mode = s.take ? 'playback' : 'idle'; s.playing = false
    setMode(s.mode)
    channel.current?.postMessage({ type: 'stop' })
  }
  const record = () => {
    const s = session.current
    if (phase !== 'live' || !rig.current || !s.frame?.pose.length || performance.now() - s.receivedAt > 500) {
      setNote('Wait for body tracking before recording. Keep shoulders and hands in view.'); return
    }
    s.samples = []; s.recordStart = performance.now(); s.mode = 'recording'
    setMode('recording'); setNote('Recording motion · 30 second maximum')
  }
  const exportGlb = async () => {
    if (!take || !rig.current) return
    setExporting(true)
    try {
      // Freeze a private clone so live preview cannot mutate it during texture encoding.
      const model = clone(rig.current.root)
      const buffer = await new GLTFExporter().parseAsync(model, { binary: true, animations: [takeClip(take, model)], onlyVisible: false })
      if (!(buffer instanceof ArrayBuffer)) throw new Error('Animation export did not produce a GLB.')
      downloadMotion(buffer, 'dealer-motion.glb', 'model/gltf-binary')
      setNote('Exported animated GLB. Import it into Blender with glTF 2.0.')
    } catch (error) { setNote(`Export failed: ${String(error)}`) }
    finally { setExporting(false) }
  }
  return <div className="h-full overflow-y-auto bg-[#191c20] text-[#e0e4df]">
    <div className="p-3">
      <h2 className="text-sm font-medium">Webcam motion</h2>
      <p className="mt-1 text-xs text-neutral-400">Upper body, hands and skull expressions. Camera frames are processed in this browser; no audio is captured.</p>
    </div>
    <div className="relative h-72 min-h-56 bg-[#151b19]">
      <Canvas camera={{ position: [0, 1.35, 3.5], fov: 38 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={2.5} />
        <directionalLight position={[-3, 2, 1]} intensity={1.2} color="#bfd5db" />
        <Suspense fallback={<Html center>Loading character…</Html>}>
          <MotionActor session={session} onReady={onReady} onFinished={finish} channel={channel} sendScene={sendScene} />
        </Suspense>
        <OrbitControls target={[0, 1.05, 0]} minDistance={1} maxDistance={6} />
      </Canvas>
      <video ref={video} muted playsInline aria-label="Mirrored webcam preview"
        className="absolute bottom-2 right-2 w-32 rounded border border-neutral-600 bg-black" style={{ transform: 'scaleX(-1)', visibility: phase === 'off' ? 'hidden' : 'visible' }} />
    </div>
    <div className="space-y-4 p-3">
      <section aria-label="Capture controls" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!ready || phase !== 'off'} onClick={() => { setCalibrated(false); void start(); setMode('live') }}>Enable webcam</button>
          <button className={button} disabled={phase === 'off'} onClick={cameraOff}>Stop camera</button>
          <button className={button} disabled={phase !== 'live'} onClick={() => {
            const frame = session.current.frame
            if (!frame || !rig.current?.calibrate(frame)) { setNote('Face forward with your face and shoulders visible to calibrate.'); return }
            setCalibrated(true); setNote('Neutral head and torso calibrated. Move naturally.')
          }}>{calibrated ? 'Recalibrate neutral' : 'Calibrate neutral'}</button>
        </div>
        <p role="status" className="text-xs text-emerald-200">{status}</p>
        <p className="text-xs text-neutral-400">{tracking || 'First start downloads the tracking model (about 14 MB).'}</p>
      </section>
      <section aria-label="Rig settings" className="space-y-3 border-t border-neutral-700 pt-3">
        <strong className="text-xs">Rig settings</strong>
        <label className="block text-xs">Smoothing · {smoothing.toFixed(2)} s
          <input className="mt-1 w-full accent-emerald-400" type="range" min={.02} max={.4} step={.01} value={smoothing}
            onChange={event => { const value = Number(event.target.value); setSmoothing(value); session.current.smoothing = value }} />
        </label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={sendScene} onChange={event => {
          setSendScene(event.target.checked)
          if (!event.target.checked) channel.current?.postMessage({ type: 'stop' })
        }} />Drive the dealer in the open casino scene</label>
        <p className="text-xs text-neutral-400">Pausing returns the scene to its default animation. Scrubbing briefly previews the selected pose.</p>
        <p className="text-xs text-neutral-400">Feet stay planted. Turn slowly and keep both hands visible; a single webcam cannot recover hidden joints reliably.</p>
      </section>
      <section aria-label="Animation takes" className="space-y-2 border-t border-neutral-700 pt-3">
        <div className="flex flex-wrap gap-2">
          <button className={`${button} text-red-300`} disabled={phase !== 'live' || mode === 'recording'} onClick={record}>● Record take</button>
          <button className={button} disabled={mode !== 'recording'} onClick={finish}>Finish take</button>
          <button className={button} disabled={!take || mode === 'recording'} onClick={() => {
            session.current.mode = 'playback'; session.current.playing = !session.current.playing; setMode('playback')
          }}>Play / pause</button>
          <button className={button} disabled={phase !== 'live' || mode === 'recording'} onClick={() => { session.current.mode = 'live'; setMode('live') }}>Live preview</button>
        </div>
        <p className="text-xs">{mode === 'recording' ? `Recording ${playhead.toFixed(1)} / 30 s` : take ? `${take.name} · ${take.duration.toFixed(1)} s` : 'No recorded take yet'}</p>
        <input aria-label="Take playhead" className="w-full accent-emerald-400" type="range" min={0} max={take?.duration ?? 1} step={.01}
          value={take ? Math.min(playhead, take.duration) : 0} disabled={!take || mode === 'recording'} onChange={event => {
            const s = session.current; s.mode = 'playback'; s.playing = false; s.playhead = Number(event.target.value); setPlayhead(s.playhead); setMode('playback')
          }} />
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!take || exporting || mode === 'recording'} onClick={() => void exportGlb()}>{exporting ? 'Exporting…' : 'Export animated GLB'}</button>
          <button className={button} disabled={!take || mode === 'recording'} onClick={() => take && downloadMotion(JSON.stringify(take), 'dealer-take.json', 'application/json')}>Save take JSON</button>
          <button className={button} disabled={mode === 'recording'} onClick={() => file.current?.click()}>Load take</button>
        </div>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={async event => {
          const input = event.currentTarget, selected = input.files?.[0]
          if (!selected) return
          try {
            if (selected.size > 12_000_000) throw new Error('Take is too large (12 MB maximum).')
            const loaded = parseTake(await selected.text())
            lastTake = loaded; session.current.take = loaded; session.current.mode = 'playback'; session.current.playhead = 0; session.current.playing = false
            setTake(loaded); setMode('playback'); setNote('Take loaded. Play it or export it to Blender.')
          } catch (error) { setNote(String(error)) }
          input.value = ''
        }} />
        <p role="status" className="text-xs text-amber-200">{note}</p>
        <p className="text-xs text-neutral-400">Switching modules stops the camera and keeps your take. Save it before closing or reloading the tool.</p>
      </section>
    </div>
  </div>
}
