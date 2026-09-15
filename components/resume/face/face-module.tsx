'use client'

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { Group } from 'three'
import manifest from '@/public/models/casino-dealer-v3.json'
import { DealerFaceRig, FACE_LOOP_SECONDS, facePose } from './face-rig'
import { FACE_CONTROLS, FACE_DEFAULTS, FACE_PRESETS, getFaceSettings, saveFaceSettings, setFaceSettings, useFaceSettings } from './face-settings'
import { DealerRetargeter } from '../motion/retarget'
import { downloadMotion, takeClip } from '../motion/takes'
import type { MotionTake } from '../motion/types'
import { useMouseLook } from './use-mouse-look'

function FacePreview({ onReady }: { onReady: (rig: DealerFaceRig | null) => void }) {
  const { scene } = useGLTF(manifest.model)
  const model = useMemo(() => clone(scene), [scene])
  const modelRef = useRef<Group>(null)
  const rig = useRef<DealerFaceRig | null>(null)
  const started = useRef<number | null>(null)
  const mouseLook=useMouseLook()
  useLayoutEffect(() => {
    rig.current = new DealerFaceRig(modelRef.current!)
    onReady(rig.current)
    return () => { rig.current = null; onReady(null) }
  }, [model,onReady])
  useFrame(({ clock },dt) => {
    started.current ??= clock.elapsedTime
    const settings=getFaceSettings()
    rig.current?.apply(mouseLook(facePose(settings,clock.elapsedTime-started.current),settings,model,dt),dt)
  })
  return <primitive ref={modelRef} object={model} dispose={null} />
}

const button='rounded border border-neutral-600 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40'

export default function FaceModule() {
  const settings=useFaceSettings()
  const preview=useRef<DealerFaceRig | null>(null)
  const [ready,setReady]=useState(false)
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState('Changes update the open casino scene. Save to keep your default face.')
  const onReady=useCallback((rig: DealerFaceRig | null) => { preview.current=rig; setReady(!!rig) },[])
  useEffect(() => { document.title='Cartoon face · animation tool' },[])
  const exportAnimation=async (format: 'glb' | 'json') => {
    if (!preview.current) return
    setBusy(true)
    try {
      const config={...getFaceSettings()}
      const model=clone(preview.current.root)
      preview.current.neutralize(model)
      const rig=new DealerFaceRig(model), sampler=new DealerRetargeter(model)
      const duration=FACE_LOOP_SECONDS/config.speed
      const steps=Math.ceil(duration*24)
      const take: MotionTake={version:1,model:'casino-dealer-v3',name:'Dealer facial idle',duration,frames:[]}
      for (let i=0;i<=steps;i++) {
        const time=i/steps*duration
        rig.apply(facePose(config,time))
        take.frames.push(sampler.sample(time))
      }
      rig.neutralize()
      if (format==='json') downloadMotion(JSON.stringify(take),'dealer-face-take.json','application/json')
      else {
        const file=await new GLTFExporter().parseAsync(model,{binary:true,animations:[takeClip(take,model)],onlyVisible:false})
        if (!(file instanceof ArrayBuffer)) throw new Error('Export did not produce GLB data.')
        downloadMotion(file,'dealer-cartoon-face.glb','model/gltf-binary')
      }
      setNote(format==='json' ? 'Face take exported. Load it in Webcam Motion to scrub or replay it.' : 'Animated GLB exported with jaw, sockets, head rotation and scale tracks.')
    } catch (error) { setNote(`Export failed: ${String(error)}`) }
    finally { setBusy(false) }
  }
  return <div className="h-full overflow-y-auto bg-[#191c20] text-[#e0e4df]">
    <header className="p-3">
      <h2 className="text-sm font-medium">Cartoon face</h2>
      <p className="mt-1 text-xs text-neutral-400">A bouncing, elastic skull with changing expressions. Tune the performance or pose him by hand.</p>
    </header>
    <div className="h-80 bg-[#242d29]">
      <Canvas camera={{position:[0,1.6,1.15],fov:36}}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[2,4,3]} intensity={2} />
        <directionalLight position={[-3,2,1]} intensity={1} color="#b5d2cf" />
        <Suspense fallback={<Html center>Loading face rig…</Html>}><FacePreview onReady={onReady} /></Suspense>
        <OrbitControls target={[0,1.57,0]} minDistance={.5} maxDistance={3} />
      </Canvas>
    </div>
    <div className="space-y-4 p-3">
      <div aria-label="Expression presets" className="flex flex-wrap gap-2">
        {Object.entries(FACE_PRESETS).map(([name,preset]) => <button key={name} className={button} onClick={() => {
          setFaceSettings({...FACE_DEFAULTS,...preset,followMouse:settings.followMouse,idle:name==='Neutral' ? false : name==='Showtime' ? true : settings.idle})
          setNote(`${name} pose. Adjust the controls or enable idle animation.`)
        }}>{name}</button>)}
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.idle} onChange={e => setFaceSettings({idle:e.target.checked})} />Animate performance · bounce, morphs and changing expressions</label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.followMouse} onChange={e => setFaceSettings({followMouse:e.target.checked})} />Look toward mouse</label>
      {['Idle animation','Jaw & mouth','Sockets & brows','Head & skull'].map(group => <details key={group} open={group==='Idle animation'} className="border-t border-neutral-700 pt-3">
        <summary className="cursor-pointer text-xs font-medium">{group}</summary>
        <div className="space-y-3 pt-3">
          {FACE_CONTROLS.filter(c => c.group===group).map(control => <label key={control.key} className="block text-xs">
            <span className="flex justify-between gap-2"><span>{control.label}</span><output>{settings[control.key].toFixed(control.step===1 ? 0 : 2)}</output></span>
            <input className="mt-1 w-full accent-emerald-400" type="range" min={control.min} max={control.max} step={control.step} value={settings[control.key]}
              onChange={e => setFaceSettings({[control.key]:Number(e.target.value)})} />
          </label>)}
        </div>
      </details>)}
      <div className="flex flex-wrap gap-2 border-t border-neutral-700 pt-3">
        <button className={button} onClick={() => setNote(saveFaceSettings() ? 'Default face saved in this browser.' : 'Browser saving unavailable. Export the settings to keep them.')}>Save default face</button>
        <button className={button} onClick={() => { setFaceSettings(FACE_DEFAULTS); setNote('Dealer defaults restored. Save to keep this reset.') }}>Reset</button>
        <button className={button} onClick={() => downloadMotion(JSON.stringify(getFaceSettings(),null,2),'dealer-face-settings.json','application/json')}>Export settings</button>
        <button className={button} disabled={!ready || busy} onClick={() => void exportAnimation('glb')}>{busy ? 'Exporting…' : 'Export animated GLB'}</button>
        <button className={button} disabled={!ready || busy} onClick={() => void exportAnimation('json')}>Export face take</button>
      </div>
      <p role="status" className="text-xs text-emerald-200">{note}</p>
      <p className="text-xs text-neutral-400">Skull size changes his proportions. Squash/stretch keeps the same volume, with the hat and jaw following. Live webcam performance takes priority. Animation exports contain the idle loop; mouse tracking responds live.</p>
    </div>
  </div>
}
