'use client'

import { Suspense, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Bone, Mesh, Quaternion, SkinnedMesh } from 'three'
import manifest from '@/public/models/casino-dealer-v3.json'

const availableGroups = new Set(Object.values(manifest.parts).map((part) => part.group))
const groups = ['Hat', 'Hatband', 'Waistcoat', 'Tie', 'Collar', 'Shirt', 'Trousers', 'ShoeLeft', 'ShoeRight',
  'Skull', 'Jaw', 'Neck', 'ForearmLeft', 'ForearmRight', 'HandLeft', 'HandRight'].filter((name) => availableGroups.has(name))
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase())
type Controls = {
  expressions: Record<string, number>
  hidden: string[]
  head: number
  elbow: number
  fingers: number
  explode: number
}
const initial: Controls = { expressions: {}, hidden: [], head: 0, elbow: 0, fingers: 0, explode: 0 }
const presets: Record<string, Record<string, number>> = {
  Neutral: {},
  Wink: { blinkLeft: 1, browRaiseRight: .5, smile: .65, jawOpen: .25 },
  Surprised: { browRaiseLeft: 1, browRaiseRight: 1, jawOpen: .8 },
}

function Character({ controls }: { controls: Controls }) {
  const { scene } = useGLTF(manifest.model)
  const model = useMemo(() => clone(scene), [scene])
  const rest = useMemo(() => {
    const poses = new Map<string, Quaternion>()
    model.traverse((object) => {
      if (object instanceof Bone) poses.set(object.name, object.quaternion.clone())
    })
    return poses
  }, [model])

  useLayoutEffect(() => {
    model.traverse((object) => {
      if (object instanceof Mesh) {
        // GLTFLoader wraps a part with multiple materials in a Group; its
        // skinned draw meshes inherit the logical part metadata from that group.
        let owner = object as import('three').Object3D
        while (!owner.userData.partGroup && owner.parent) owner = owner.parent
        const group: string = owner.userData.partGroup ?? object.name
        object.visible = !controls.hidden.includes(group)
        object.castShadow = object.receiveShadow = true
        if (object instanceof SkinnedMesh) object.bindMode = 'detached'
        const offsets: Record<string, [number, number, number]> = {
          Hat: [0, .38, 0], Hatband: [.4, .35, 0], Skull: [0, .14, 0],
          Jaw: [0, .03, .3], Waistcoat: [0, 0, .48], Tie: [.27, .04, .65],
          Collar: [0, .06, .18],
          Shirt: [0, 0, -.22], HandLeft: [.3, 0, 0], HandRight: [-.3, 0, 0],
          ForearmLeft: [.17, 0, 0], ForearmRight: [-.17, 0, 0],
          ShoeLeft: [.15, 0, .12], ShoeRight: [-.15, 0, .12], Trousers: [0, 0, -.15],
        }
        object.position.fromArray(offsets[group] ?? [0, 0, 0]).multiplyScalar(controls.explode)
        if (object.morphTargetDictionary && object.morphTargetInfluences) {
          for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
            object.morphTargetInfluences[index] = controls.expressions[name] ?? 0
          }
        }
      }
      if (object instanceof Bone) {
        const neutral = rest.get(object.name)
        if (neutral) object.quaternion.copy(neutral)
        if (object.name === 'Head') object.rotateY(controls.head * .6)
        if (object.name === 'LeftForeArm') object.rotateX(controls.elbow * 1.1)
        if (/^(Left|Right)(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(object.name)) {
          object.rotateX(controls.fingers * .65)
        }
      }
    })
    model.updateMatrixWorld(true)
  }, [model, rest, controls])

  return <primitive object={model} dispose={null} />
}

function Slider({ name, value, min = 0, onChange }: {
  name: string; value: number; min?: number; onChange: (value: number) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 5, margin: '12px 0', fontSize: 13 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>{name}<span>{value.toFixed(2)}</span></span>
      <input aria-label={name} type="range" min={min} max={1} step={.01} value={value}
        onChange={(event) => onChange(Number(event.target.value))} style={{ width: '100%', accentColor: '#caac6c' }} />
    </label>
  )
}

export default function CharacterStudio() {
  const [controls, setControls] = useState<Controls>(initial)
  const pose = (key: 'head' | 'elbow' | 'fingers' | 'explode', value: number) =>
    setControls((old) => ({ ...old, [key]: value }))
  return (
    <main style={{ height: '100dvh', display: 'flex', flexWrap: 'wrap', background: '#161c1a', color: '#eee7d8', fontFamily: 'sans-serif' }}>
      <section aria-label="Interactive skeleton dealer" style={{ flex: '1 1 420px', minHeight: '55dvh', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 1, pointerEvents: 'none' }}>
          <p style={{ margin: 0, color: '#caac6c', fontSize: 12, letterSpacing: 2 }}>CASINO CHARACTER / 02</p>
          <h1 style={{ margin: '8px 0', fontSize: 28 }}>The house dealer</h1>
          <p style={{ fontSize: 13, opacity: .65 }}>Drag to orbit · Scroll to inspect</p>
        </div>
        <Canvas shadows camera={{ position: [1.7, 1.35, 3.1], fov: 37 }}>
          <color attach="background" args={['#161c1a']} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[3, 5, 4]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-3, 2, -2]} intensity={1.2} color="#a8c2bc" />
          <Suspense fallback={<Html center><span style={{ whiteSpace: 'nowrap' }}>Loading dealer…</span></Html>}>
            <Character controls={controls} />
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.01, 0]} receiveShadow>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color="#202a25" roughness={1} />
          </mesh>
          <OrbitControls makeDefault target={[0, .95, 0]} minDistance={.45} maxDistance={6} maxPolarAngle={Math.PI * .51} />
        </Canvas>
      </section>
      <aside aria-label="Character controls" style={{ flex: '0 1 310px', maxHeight: '100dvh', overflowY: 'auto', padding: 24, background: '#202824', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
          <strong>Character study</strong>
          <button type="button" onClick={() => setControls(initial)} style={{ cursor: 'pointer', color: '#eee7d8', background: 'transparent', border: '1px solid #677267', borderRadius: 5, padding: '5px 9px' }}>Reset</button>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.6, opacity: .65 }}>First pass. Outfit pieces are removable; hidden anatomy is incomplete. Face controls are stylized skull expressions.</p>
        <details open>
          <summary style={{ cursor: 'pointer', marginTop: 20 }}>Expressions</summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['Neutral', 'Wink', 'Surprised'] as const).map((preset) => (
              <button key={preset} type="button" onClick={() => setControls((old) => ({ ...old, expressions: presets[preset] }))}
                style={{ cursor: 'pointer', background: '#344339', color: '#eee7d8', border: 0, borderRadius: 5, padding: 7 }}>{preset}</button>
            ))}
          </div>
          {manifest.expressions.map((name) => <Slider key={name} name={label(name)} value={controls.expressions[name] ?? 0}
            onChange={(value) => setControls((old) => ({ ...old, expressions: { ...old.expressions, [name]: value } }))} />)}
        </details>
        <details open>
          <summary style={{ cursor: 'pointer', marginTop: 20 }}>Pose</summary>
          <Slider name="Head turn" min={-1} value={controls.head} onChange={(v) => pose('head', v)} />
          <Slider name="Left elbow" value={controls.elbow} onChange={(v) => pose('elbow', v)} />
          <Slider name="Finger curl" value={controls.fingers} onChange={(v) => pose('fingers', v)} />
        </details>
        <details open>
          <summary style={{ cursor: 'pointer', marginTop: 20 }}>Detachable pieces</summary>
          <Slider name="Spread pieces" value={controls.explode} onChange={(v) => pose('explode', v)} />
          {groups.map((group) => <label key={group} style={{ display: 'flex', gap: 8, margin: '10px 0', fontSize: 13 }}>
            <input type="checkbox" checked={!controls.hidden.includes(group)} onChange={() => setControls((old) => ({ ...old,
              hidden: old.hidden.includes(group) ? old.hidden.filter((name) => name !== group) : [...old.hidden, group],
            }))} />{label(group)}
          </label>)}
        </details>
        <a href={manifest.model} download style={{ display: 'block', marginTop: 24, color: '#caac6c', fontSize: 13 }}>Download character GLB</a>
      </aside>
    </main>
  )
}
