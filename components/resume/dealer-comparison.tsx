'use client'

import { Suspense, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Bone, Mesh, SkinnedMesh, type MeshStandardMaterial } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import current from '@/public/models/casino-dealer-v3-meshopt.json'
import experiment from '@/public/models/casino-dealer-v3-1mb.json'
import './dealer-comparison.css'

type Triple = [number, number, number]
type CameraPose = { position: Triple; target: Triple }
const views: Record<string, CameraPose> = {
  Portrait: { position: [0, 1.5, 2.3], target: [0, 1.3, 0] },
  Face: { position: [0, 1.62, .85], target: [0, 1.62, 0] },
  'Left hand': { position: [.487, .80, .55], target: [.487, .80, 0] },
  'Right hand': { position: [-.486, .80, .55], target: [-.486, .80, 0] },
  'Full body': { position: [0, 1.15, 3.4], target: [0, .9, 0] },
}
const expressions: Record<string, Record<string, number>> = {
  Neutral: {}, Wink: { blinkLeft: 1, browRaiseRight: .5, smile: .65, jawOpen: .25 },
  Surprised: { browRaiseLeft: 1, browRaiseRight: 1, jawOpen: .8 },
}
type SharedCamera = MutableRefObject<CameraPose & { owner: string; version: number }>

function SyncedCamera({ id, shared, view }: { id: string; shared: SharedCamera; view: string }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree(s => s.camera)
  const syncing = useRef(false), seen = useRef(-1)
  useLayoutEffect(() => {
    syncing.current = true
    camera.position.fromArray(views[view].position)
    controls.current?.target.fromArray(views[view].target)
    controls.current?.update()
    syncing.current = false
  }, [camera, view])
  useFrame(() => {
    const state = shared.current
    if (!controls.current || state.owner === id || seen.current === state.version) return
    syncing.current = true
    camera.position.fromArray(state.position)
    controls.current.target.fromArray(state.target)
    controls.current.update()
    seen.current = state.version
    syncing.current = false
  })
  return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={.25} maxDistance={6}
    onChange={() => {
      if (syncing.current || !controls.current) return
      shared.current = { position: camera.position.toArray() as Triple, target: controls.current.target.toArray() as Triple, owner: id, version: shared.current.version + 1 }
    }} />
}

function Character({ url, expression, animate, wireframe, started }: {
  url: string; expression: string; animate: boolean; wireframe: boolean; started: MutableRefObject<number>
}) {
  const { scene } = useGLTF(url)
  const { model, meshes, bones } = useMemo(() => {
    const model = clone(scene), meshes: Mesh[] = [], bones: { bone: Bone; rotation: Bone['quaternion'] }[] = []
    model.traverse(object => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone()
        object.frustumCulled = false
        if (object instanceof SkinnedMesh) object.bindMode = 'detached'
        meshes.push(object)
      }
      if (object instanceof Bone && (['Head', 'LeftForeArm', 'RightForeArm'].includes(object.name) || /^(Left|Right)(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(object.name))) bones.push({ bone: object, rotation: object.quaternion.clone() })
    })
    return { model, meshes, bones }
  }, [scene])
  useLayoutEffect(() => {
    for (const mesh of meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      (material as MeshStandardMaterial).wireframe = wireframe
    }
  }, [meshes, wireframe])
  useFrame(() => {
    const t = animate ? (performance.now() - started.current) / 1000 : 0
    const values = animate ? { blinkLeft: Math.max(0, Math.sin(t * 2)) ** 16, blinkRight: Math.max(0, Math.sin(t * 2)) ** 16,
      jawOpen: .35 + .3 * Math.sin(t * 1.5), smile: .5 + .5 * Math.sin(t), browRaiseLeft: .5 + .5 * Math.sin(t * .8) } : expressions[expression]
    for (const mesh of meshes) if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) mesh.morphTargetInfluences[index] = values[name] ?? 0
    }
    for (const { bone, rotation } of bones) {
      bone.quaternion.copy(rotation)
      if (animate) {
        if (bone.name === 'Head') bone.rotateY(Math.sin(t * .7) * .3)
        else if (/^(Left|Right)(Thumb|Index|Middle|Ring|Pinky)/.test(bone.name)) bone.rotateX((.5 + .5 * Math.sin(t)) * .6)
        else bone.rotateX(Math.sin(t) * .3)
      }
    }
  })
  return <primitive object={model} dispose={null} />
}

export default function DealerComparison() {
  const [view, setView] = useState('Portrait'), [expression, setExpression] = useState('Neutral')
  const [animate, setAnimate] = useState(false), [wireframe, setWireframe] = useState(false)
  const shared = useRef({ ...views.Portrait, owner: '', version: 0 }), started = useRef(0)
  const saving = Math.round((1 - experiment.bytes / current.bytes) * 100)
  return <main className="dealer-compare">
    <header>
      <a href="/resume">← Back to résumé</a>
      <p className="eyebrow">DEALER / SIZE STUDY</p>
      <h1>Is the smaller model worth it?</h1>
      <p>Same lighting, camera and expression. Drag either view to rotate both; scroll to zoom. The example is {saving}% smaller.</p>
    </header>
    <div className="comparison-controls">
      <div role="group" aria-label="Camera framing">{Object.keys(views).map(name => <button key={name} aria-pressed={view === name} onClick={() => {
        shared.current = { ...views[name], owner: '', version: shared.current.version + 1 }; setView(name)
      }}>{name}</button>)}</div>
      <div role="group" aria-label="Expression">{Object.keys(expressions).map(name => <button key={name} aria-pressed={!animate && expression === name} onClick={() => { setAnimate(false); setExpression(name) }}>{name}</button>)}</div>
      <button aria-pressed={animate} onClick={() => { started.current = performance.now(); setAnimate(!animate) }}>{animate ? 'Stop motion' : 'Animate both'}</button>
      <label><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} /> Wireframe</label>
    </div>
    <div className="comparison-panels">
      {[{ id: 'current', title: 'Previous full model', manifest: current, detail: '65,958 triangles · 2048px texture' },
        { id: 'example', title: 'Current optimized model', manifest: experiment, detail: `${experiment.triangles.toLocaleString()} triangles · Upper body · 1024px texture` }].map(item =>
        <section key={item.id} aria-label={`${item.title} model`}>
          <div className="panel-heading"><div><h2>{item.title}</h2><p>{item.detail}</p></div><strong>{(item.manifest.bytes / 1e6).toFixed(2)} MB</strong></div>
          <div className="comparison-canvas">
            <Canvas dpr={[1, 2]} camera={{ position: views.Portrait.position, fov: 37 }}>
              <color attach="background" args={['#161c1a']} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[3, 5, 4]} intensity={2.3} />
              <directionalLight position={[-3, 2, -2]} intensity={1.2} color="#a8c2bc" />
              <Suspense fallback={<Html center>Loading model…</Html>}>
                <Character url={item.manifest.model} expression={expression} animate={animate} wireframe={wireframe} started={started} />
              </Suspense>
              <SyncedCamera id={item.id} shared={shared} view={view} />
            </Canvas>
          </div>
          <a className="download" href={item.manifest.model} download>Download this model ↓</a>
        </section>)}
    </div>
    <footer>Inspect the face, finger joints and painted clothing up close, then switch to Portrait to judge the normal viewing size. The optimized model adds finger-joint connectors and omits the trousers and shoes hidden below the table. Sizes are the GLB files before HTTP compression. The résumé now uses the optimized model.</footer>
  </main>
}
