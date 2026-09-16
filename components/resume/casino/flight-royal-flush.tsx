'use client'

import { CardArtworkLoader } from './card-art-textures'

import { cardArtUrl } from './card-art-url'

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { CASINO_PALETTE, compileMaterial, graph, materialUniforms } from 'blender-to-threejs'
import * as THREE from 'three'
import { ASPECT, cardGeometry, ROYAL_FLUSH, sharedCardMaterials } from './playing-cards'
import { register } from './materials'
import { flightEditor } from './flight-editor'
import { useFlightTransform } from './use-flight-transform'
import { beatTime, getTune } from './tune'
import FlightCallout, { placeFlightCallout } from './flight-callout'
import { CardDepthStack } from './card-depth-stack'
import { ScreenExit } from './screen-exit'
import { DEALER_CARD_CATCH, DEALER_CARD_DROP_DURATION, FLIGHT_CARD_TO_GRIP, incomingCardMatrix, type DealerCardHandoff } from './dealer-card-handoff'

const FACES = ROYAL_FLUSH.map(rank => cardArtUrl(`${rank}-hearts`))
const TRANSFORM = {
  x: 'rfX', y: 'rfY', depth: 'rfDepth', size: 'rfSize',
  sx: 'rfScaleX', sy: 'rfScaleY', sz: 'rfScaleZ', tilt: 'rfTilt', yaw: 'rfYaw', bank: 'rfBank',
} as const
const CARD_WIDTH = 2 / 3
// Source artwork is 2:3. One small stock mesh is shared by every card/remount.
const STOCK_GEOMETRY = cardGeometry(1, undefined, 6).scale(CARD_WIDTH / ASPECT, 1, 1)
const faces = new WeakMap<THREE.Texture, THREE.Material>()

/** Public-domain English card art on thin, rounded stock; no generated meshes. */
export default function FlightRoyalFlush({ clock0, cardHandoff }: { clock0: MutableRefObject<number>; cardHandoff?:DealerCardHandoff }) {
  const maps = useLoader(CardArtworkLoader, FACES)
  const group = useRef<THREE.Group>(null)
  const caption = useRef<THREE.Group>(null)
  const cards = useRef<(THREE.Mesh | null)[]>([])
  const { gl } = useThree()
  const angles = useMemo(() => new THREE.Euler(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const sway = useMemo(() => new THREE.Quaternion(), [])
  const upright = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const inverseRotation = useMemo(() => new THREE.Quaternion(), [])
  const arrivalOffset = useMemo(() => new THREE.Vector3(), [])
  const depthStack = useMemo(() => new CardDepthStack(), [])
  const screenExit = useMemo(() => new ScreenExit(), [])
  const lightDirection = useMemo(() => new THREE.Vector3(), [])
  const materials = useMemo(() => {
    const shared = sharedCardMaterials()
    return maps.map((map, i) => {
      let face = faces.get(map)
      if (!face) {
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = 4
        const g = graph()
        // Warm stock and a broad camera-space key give each turning face tone.
        // This is an art-directed light approximation, not a baked room light.
        const n = g.normal('world')
        const key = g.add(g.multiply(g.separate(n, 'z'), g.uniform('cardKeyZ', 0.8)),
          g.add(g.multiply(g.separate(n, 'x'), g.uniform('cardKeyX', -0.35)),
            g.multiply(g.separate(n, 'y'), g.uniform('cardKeyY', 0.25))))
        const lift = g.mapRange(key, { from: [0.15, 1], to: [0.55, 1.03], clamp: true })
        const paper = g.multiplyColor(1, g.texture(map, g.uv()), g.rgb(...CASINO_PALETTE.paper))
        face = compileMaterial(register(`flightCard:${ROYAL_FLUSH[i]}`, g.multiplyColor(1, paper, lift)))
        faces.set(map, face)
      }
      return [face, shared.back, shared.rim]
    })
  }, [maps])
  useFlightTransform('royal-flush', 'Royal flush', group, TRANSFORM)
  useEffect(()=>{
    if(!cardHandoff)return
    cardHandoff.setAvailable(true)
    return ()=>{cardHandoff.setAvailable(false)}
  },[cardHandoff])

  useFrame(({ camera, clock }) => {
    const root = group.current
    if (!root) return
    const tn = getTune()
    const t = clock0.current >= 0 ? beatTime(clock.elapsedTime - clock0.current) : -1
    const clockAge = t - tn.jkFlick - tn.rfDelay
    const exitFor = Math.min(tn.rfExit, tn.jkFallFor * 0.65)
    const leaveAt = Math.max(0.1, tn.jkRise + tn.jkHold + tn.jkFallFor - tn.rfDelay - exitFor)
    const receiving=!!cardHandoff?.active&&clockAge>=leaveAt
    const catchAt=tn.jkRise+tn.jkHold+tn.jkFallFor-tn.rfDelay+DEALER_CARD_CATCH
    const age=receiving?Math.min(clockAge,catchAt):clockAge
    const visible = clockAge >= 0
    const wasVisible = root.visible
    root.visible = visible
    if (!visible) {
      if (wasVisible) flightEditor.refresh()
      if (caption.current) caption.current.visible = false
      return
    }

    lightDirection.set(-0.35, 0.25, 0.8).applyQuaternion(camera.quaternion)
    for (const [face] of materials) {
      const uniforms = materialUniforms(face)
      uniforms.cardKeyX.value = lightDirection.x
      uniforms.cardKeyY.value = lightDirection.y
      uniforms.cardKeyZ.value = lightDirection.z
    }

    const pc = camera as THREE.PerspectiveCamera
    const hh = Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) * 11
    const hw = hh * pc.aspect
    const length = Math.min(hh * 0.9, hw * 0.46) * tn.rfSize
    // Fit the entire deal before departure, even when the shot is shortened.
    const stagger = Math.min(tn.rfStagger, leaveAt * 0.1)
    const enterFor = Math.min(tn.rfEnter, leaveAt - stagger * 4)
    const enter = Math.min(1, age / enterFor)
    const leave = Math.max(0, (clockAge - leaveAt) / exitFor)
    // Bound the entire rotated fan, including arbitrary editor scale/offsets.
    // Travel completely beyond the viewport before changing visibility.
    const extent = length * (2 * CARD_WIDTH * tn.rfSpread + 0.75 + 0.35 * tn.rfFlow) * Math.max(Math.abs(tn.rfScaleX), Math.abs(tn.rfScaleY), Math.abs(tn.rfScaleZ))
    const offscreen = hw * (1 + Math.abs(tn.rfDepth) / 11) + extent + 0.3
    const travel = offscreen + Math.abs(hw * tn.rfX)
    const rootEntry = travel * (1 - enter) ** 3
    // Camera-space Y keeps the bob vertical even with the hand banked sideways.
    // The shared beat clock preserves replay timing and the editor's freeze.
    const bob = tn.rfBob * Math.sin(age * tn.rfBobSpeed)
    const sweep = tn.rfSway * Math.sin(age * tn.rfSwaySpeed)
    root.position.set(hw * tn.rfX + rootEntry + travel * leave ** 2 + hw * 0.08 * sweep,
      hh * (tn.rfY + age * tn.rfDrift + bob + (pc.aspect < .9 ? .28 : 0)), -11 + tn.rfDepth)
    root.position.applyQuaternion(camera.quaternion).add(camera.position)
    angles.set(tn.rfTilt + (0.06 + 0.10 * tn.rfFlow) * Math.sin(age * 2.2),
      tn.rfYaw,
      tn.rfBank + (0.045 + 0.08 * tn.rfFlow) * Math.sin(age * 2.7 - 0.3))
    // Upright camera Y precedes the authored bank, just like the roulette.
    // Keep the full combined rotation for camera-space deal offsets below.
    sway.setFromAxisAngle(upright, sweep)
    rotation.setFromEuler(angles).premultiply(sway)
    root.quaternion.copy(camera.quaternion).multiply(rotation)
    inverseRotation.copy(rotation).invert()
    root.scale.set(length * tn.rfScaleX, length * tn.rfScaleY, length * tn.rfScaleZ)
    placeFlightCallout(caption.current, root, camera, hw, hh, tn.rfTextX, tn.rfTextY, tn.rfTextSize, tn.rfTextR, age)
    for (let i = 0; i < 5; i++) {
      const card = cards.current[i]
      if (!card) continue
      card.userData.cardRenderLayer=2
      card.matrixAutoUpdate=true
      const cardAge = age - i * stagger
      card.visible = cardAge >= 0
      if (!card.visible) continue
      const k = i - 2
      const u = THREE.MathUtils.clamp(cardAge / enterFor, 0, 1)
      const energy = tn.rfEnergy
      const back = 0.85 * energy
      const arrive = 1 + (back + 1) * (u - 1) ** 3 + back * (u - 1) ** 2
      const coast = u * u * (3 - 2 * u)
      const direction = i % 2 === 0 ? -1 : 1
      // Each card starts beyond the RIGHT edge, regardless of the authored bank.
      // Cancel the root's common entrance so these are five independent flights.
      arrivalOffset.set(travel * (1 - arrive) - rootEntry,
        hh * 0.18 * energy * direction * Math.sin(Math.PI * u) ** 2, 0).applyQuaternion(inverseRotation)
      arrivalOffset.set(
        arrivalOffset.x / (length * (Math.abs(tn.rfScaleX) > 1e-5 ? tn.rfScaleX : 1e-5)),
        arrivalOffset.y / (length * (Math.abs(tn.rfScaleY) > 1e-5 ? tn.rfScaleY : 1e-5)),
        arrivalOffset.z / (length * (Math.abs(tn.rfScaleZ) > 1e-5 ? tn.rfScaleZ : 1e-5)),
      )
      const flutter = Math.sin(Math.PI * u) * (1 - u) * energy
      const phase = age * tn.rfFlowSpeed - i * 0.8
      const flow = tn.rfFlow * coast
      // Keep a rolling wave through the assembled hand: spacing breathes,
      // individual cards lift and twist, and the whole fan rolls more slowly.
      card.position.set(k * CARD_WIDTH * tn.rfSpread * (1 + 0.18 * flow * Math.sin(age * tn.rfFlowSpeed)) + 0.045 * flow * Math.sin(phase),
        -Math.abs(k) * 0.045 + 0.085 * flow * Math.cos(phase),
        i * 0.045 + 0.065 * flow * Math.sin(phase) + flutter * 0.45).add(arrivalOffset)
      card.rotation.set(flutter * 0.22 + 0.28 * flow * Math.sin(phase),
        direction * flutter * 0.16 + 0.22 * flow * Math.cos(phase * 0.85),
        -k * tn.rfArc + direction * (0.55 + i * 0.12) * energy * (1 - arrive)
        + 0.16 * flow * Math.sin(phase + 0.5))
    }
    depthStack.resolve(cards.current)
    if(receiving) {
      root.updateWorldMatrix(true,true)
      const dropAt=catchAt-DEALER_CARD_DROP_DURATION
      const progress=(clockAge-dropAt)/DEALER_CARD_DROP_DURATION
      // Let the entire close-up fan exit. Only then reuse the two held cards
      // for a short vertical drop at the dealer's depth.
      for(let i=0;i<5;i++) {
        const card=cards.current[i]
        if(card && clockAge>=leaveAt+exitFor) card.visible=!screenExit.cleared(card,camera,'right')
      }
      for(let i=0;i<2;i++) {
        if(clockAge<dropAt)continue
        const card=cards.current[i+3]!,target=cardHandoff!.targets![i]
        target.updateWorldMatrix(true,false)
        const end=target.matrixWorld.clone()
          .multiply(new THREE.Matrix4().makeScale(1/Math.max(.001,target.scale.x),1,1))
          .multiply(new THREE.Matrix4().makeTranslation(.016*(1-target.scale.x),0,0))
          .multiply(FLIGHT_CARD_TO_GRIP)
        // At the dealer, use physical depth so the fingers can occlude the stock.
        card.userData.cardRenderLayer=0
        const world=incomingCardMatrix(end,progress,i)
        card.matrixAutoUpdate=false
        card.matrix.copy(root.matrixWorld.clone().invert().multiply(world))
        card.matrixWorldNeedsUpdate=true
        card.visible=true
      }
    }
    // Captions leave with the outgoing fan, not at the start of the catch.
    if(clockAge>=leaveAt+exitFor) {
      if(caption.current && screenExit.cleared(caption.current,camera,'right')) caption.current.visible=false
      if(!receiving && screenExit.cleared(root,camera,'right') && !caption.current?.visible) root.visible=false
    }
    if(root.visible!==wasVisible) flightEditor.refresh()
  },.75) // after the dealer poses its receiving hand, before the compositor

  return <><group ref={group} name="flight-royal-flush" visible={false} dispose={null} userData={{ cardRenderLayer: 2 }}
    onPointerDown={event => { event.stopPropagation(); flightEditor.pick(event.object); gl.domElement.focus() }}>
    {ROYAL_FLUSH.map((rank, i) => <mesh key={rank} ref={node => { cards.current[i] = node }} name={`${rank} of hearts`}
      geometry={STOCK_GEOMETRY} material={materials[i]} />)}
  </group>
  <FlightCallout kind="royal-flush" objectRef={caption} anchor={group} /></>
}
