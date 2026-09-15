'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CaptureFrame, MotionSession } from './types'

export function useWebcam(session: RefObject<MotionSession>) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Camera off')
  const [phase, setPhase] = useState<'off' | 'starting' | 'live'>('off')
  const [tracking, setTracking] = useState('')
  const lifecycle = useRef({ generation: 0, stream: null as MediaStream | null, worker: null as Worker | null, raf: 0, timer: 0 })

  const release = useCallback(() => {
    const state = lifecycle.current
    state.generation++
    cancelAnimationFrame(state.raf)
    clearTimeout(state.timer)
    state.worker?.terminate(); state.worker = null
    state.stream?.getTracks().forEach(track => track.stop()); state.stream = null
    if (video.current) video.current.srcObject = null
    session.current.frame = null
    if (session.current.mode === 'live') session.current.mode = 'idle'
  }, [session])
  useEffect(() => release, [release])
  const stop = useCallback(() => { release(); setPhase('off'); setStatus('Camera off'); setTracking('') }, [release])

  const start = useCallback(async () => {
    release()
    const state = lifecycle.current, generation = state.generation
    setPhase('starting'); setStatus('Starting camera and loading motion tracker…')
    const fail = (message: string) => {
      if (generation !== state.generation) return
      release(); setPhase('off'); setStatus(message); setTracking('')
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs localhost or HTTPS in a supported browser.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })
      if (generation !== state.generation) { stream.getTracks().forEach(track => track.stop()); return }
      state.stream = stream
      if (!video.current) throw new Error('Camera preview is unavailable.')
      video.current.srcObject = stream
      await video.current.play()
      if (generation !== state.generation) return
      const worker = new Worker('/motion-capture-worker.js')
      state.worker = worker
      state.timer = window.setTimeout(() => fail('Tracker timed out. Check the connection, then retry.'), 90_000)
      let busy = false, lastFrame = -1, lastAt = 0
      const pump = async (time: number) => {
        if (generation !== state.generation) return
        state.raf = requestAnimationFrame(pump)
        const v = video.current
        if (busy || !v || v.readyState < 2 || v.currentTime === lastFrame || time - lastAt < 1000/24) return
        busy = true; lastFrame = v.currentTime; lastAt = time
        try {
          const bitmap = await createImageBitmap(v)
          if (generation !== state.generation) { bitmap.close(); return }
          worker.postMessage({ type: 'frame', bitmap, time, width: v.videoWidth, height: v.videoHeight }, [bitmap])
        } catch (error) { fail(`Camera frame failed: ${String(error)}`) }
      }
      worker.onerror = event => fail(`Tracker failed: ${event.message}`)
      worker.onmessage = ({ data }: MessageEvent<{ type: string; frame: CaptureFrame; message: string }>) => {
        if (generation !== state.generation) return
        if (data.type === 'error') { fail(`Tracker failed: ${data.message}`); return }
        if (data.type === 'ready') {
          clearTimeout(state.timer)
          setPhase('live'); setStatus('Camera live — face forward with shoulders and hands in view')
          session.current.mode = 'live'
          state.raf = requestAnimationFrame(pump)
        } else if (data.type === 'result') {
          busy = false
          session.current.frame = data.frame
          session.current.receivedAt = performance.now()
          setTracking([data.frame.pose.length ? 'Body ✓' : 'Body missing', data.frame.face.length ? 'Face ✓' : 'Face missing',
            data.frame.leftHand.length ? 'Left hand ✓' : 'Left hand missing', data.frame.rightHand.length ? 'Right hand ✓' : 'Right hand missing'].join(' · '))
        }
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => fail('Camera disconnected. Reconnect it and retry.'))
      worker.postMessage({ type: 'init' })
    } catch (error) {
      fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera access was declined. Allow it in browser settings, then retry.' : String(error))
    }
  }, [release, session])

  return { video, status, phase, tracking, start, stop }
}
