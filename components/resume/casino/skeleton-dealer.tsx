'use client'

import { CardArtworkLoader } from './card-art-textures'

import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Group, Mesh, MeshStandardMaterial, Texture, type Vector3, type Material } from 'three'
import { compGraph, compileComp, compileMaterial, graph, lit } from 'blender-to-threejs'
import { inkUniform, lamp, LIT_MATERIALS, trackLit } from './materials'
import { startupStage } from './startup-timing'
import { dealerActing, dealerPart, dealerPlacement, isDealerSkull, poseDealerAtTable, SKELETON_DEALER_URL } from './dealer-pose'
import type { ImpactFx } from './hero-chip'
import { getTune, useTune } from './tune'
import { impactRevealMask } from './impact-reveal'
import { DealerRetargeter } from '../motion/retarget'
import { MOTION_CHANNEL, validPose } from '../motion/scene-bridge'
import type { PoseSample } from '../motion/types'
import { PANEL_EDIT_EVENT } from '@/components/panels/panel-events'
import { DealerFaceRig, facePose } from '../face/face-rig'
import { useFaceSettings } from '../face/face-settings'
import { useMouseLook } from '../face/use-mouse-look'
import { DEALER_IDLE_START, DealerEntranceRig, DEALER_ENTRANCE_END, dealerEntrance, entranceFace, blendEntranceFace } from './dealer-entrance'
import { disposeDealerWrist } from './dealer-wrist'
import { disposeDealerHandSkin } from './dealer-hand-skin'
import { DealerBodyRig } from './dealer-idle'
import { applyDealerPointAction, applyDealerCardAction, type DealerCardHandoff } from './dealer-card-handoff'
import { DEALER_CARD_ART } from './dealer-shuffle'
import { sharedCardBackTexture } from './playing-cards'

type DealerRenderMesh = { mesh: Mesh; skull: boolean; hat: boolean; cards: boolean }

/** Imperative scene state, independent of React's immutable render state. */
function updateDealerAppearance(meshes: DealerRenderMesh[], bodyReveal: number, hatVisible: boolean, live: boolean, cardsActive: boolean) {
  for (const { mesh, skull, hat, cards } of meshes) {
    if (cards && cardsActive) { mesh.visible = false; continue }
    if (skull) continue
    mesh.visible = bodyReveal > 0 && (!hat || live || hatVisible)
    mesh.castShadow = mesh.visible && bodyReveal === 1
    // Position overrides ignore cutout masks; hidden body surfaces must not print ghosts.
    mesh.userData.compNoPosition = bodyReveal < 1
  }
}

export default function SkeletonDealer({ feltY, chordZ, rail, fit, fx, motionRef, onReady, cardHandoff, pointTarget }: {
  feltY: number; chordZ: number; rail: number; fit: number
  fx: MutableRefObject<ImpactFx>
  motionRef: MutableRefObject<boolean>
  onReady: (object: Group | null) => void
  cardHandoff?: DealerCardHandoff
  pointTarget?: MutableRefObject<Vector3 | null>
}) {
  const { scene } = useGLTF(SKELETON_DEALER_URL)
  const cardMaps = useLoader(CardArtworkLoader, [...DEALER_CARD_ART])
  const cardBack = sharedCardBackTexture()
  const { dealerSize, dealerX, dealerY, dealerZ, dealerYaw, dealerPitch, dealerRoll, dealerBodyAmount } = useTune()
  const group = useRef<Group>(null)
  const modelRef = useRef<Group>(null)
  const motionRig = useRef<DealerRetargeter | null>(null)
  const faceRig = useRef<DealerFaceRig | null>(null)
  const faceSettings = useFaceSettings()
  const mouseLook = useMouseLook()
  const homePose = useRef<PoseSample | null>(null)
  const incoming = useRef<{ sample: PoseSample; at: number } | null>(null)
  const wasLive = useRef(false)
  const previous = useRef({ blink: -1, bodyReveal: -1, visible: false })
  const { model, materials, entrance, body, renderMeshes, revealUniforms } = useMemo(() => {
    const finishSetup = startupStage('dealer-rig-material-setup')
    const model = clone(scene)
    poseDealerAtTable(model)
    const entrance = new DealerEntranceRig(model)
    const body = new DealerBodyRig(model)
    body.shuffle.setArtwork([...cardMaps, cardBack])
    // This graph contains only per-pixel math: reuse its exact noise/edge in the
    // body material without adding a render pass or sampling a scene texture.
    const unusedSource = new Texture()
    const reveal = compileComp(impactRevealMask(compGraph()), { sceneTexture: unusedSource })
    unusedSource.dispose()
    const materials = new Map<string, ReturnType<typeof compileMaterial>>()
    const painted = (source: Material, part: string, skull: boolean) => {
      const key = `${source.uuid}:${skull ? 'skull' : part === 'Hat' || part === 'Hatband' ? part : 'body'}`
      const cached = materials.get(key)
      if (cached) return cached
      const g = graph()
      const pbr = source as MeshStandardMaterial
      const color = inkUniform(g, 'ink', [pbr.color.r, pbr.color.g, pbr.color.b])
      let base = pbr.map ? g.multiplyColor(1, g.texture(pbr.map, g.uv()), color) : color
      if (pbr.vertexColors) base = g.multiplyColor(1, base, g.vertexColor())
      if (part === 'Hat') {
        // Mid-tone warm gray felt: a black albedo disappears under the night pass.
        const shape = g.mapRange(g.separate(g.normal('world'), 'y'), { from: [-1, 1], to: [.72, 1.2], clamp: true })
        base = g.multiplyColor(1, inkUniform(g, 'ink', [.28, .25, .21]), shape)
      } else if (part === 'Hatband') base = inkUniform(g, 'ink', [.4, .055, .035])
      // Retain the skull artwork and outfit colours through the room's paint pass.
      // Match cardArtMaterial's lighting for the common flying-deck back, while
      // retaining the dealer's own material/reveal lifecycle.
      const col = source.name === 'Dealer card back' ? base : lit(g, base, g.add(.48, g.multiply(lamp(g), .75)))
      const mat = trackLit(compileMaterial(col))
      if (!skull) {
        mat.opacityNode = reveal.output.r
        mat.alphaTest = .5
        mat.userData.dealerRevealUniforms = reveal.uniforms
      }
      mat.name = `dealer:${source.name}`
      materials.set(key, mat)
      return mat
    }
    const renderMeshes: DealerRenderMesh[] = []
    model.traverse((node) => {
      const object = node as Mesh
      if (!object.isMesh) return
      const part = dealerPart(object), skull = isDealerSkull(object)
      renderMeshes.push({ mesh: object, skull, hat: part === 'Hat' || part === 'Hatband', cards: object.name.startsWith('DealerCards_') })
      object.userData.dealerSkull = skull
      object.material = Array.isArray(object.material) ? object.material.map((m) => painted(m, part, skull)) : painted(object.material, part, skull)
      object.visible = skull
      object.castShadow = true
      object.frustumCulled = false
    })
    finishSetup()
    return { model, materials, entrance, body, renderMeshes, revealUniforms: reveal.uniforms }
  }, [scene, cardMaps, cardBack])
  const appearance = useRef({ renderMeshes, revealUniforms })
  const placement = useMemo(() => dealerPlacement(feltY, chordZ, rail, fit,
    { dealerSize, dealerX, dealerY, dealerZ, dealerYaw, dealerPitch, dealerRoll }),
  [feltY, chordZ, rail, fit, dealerSize, dealerX, dealerY, dealerZ, dealerYaw, dealerPitch, dealerRoll])

  useLayoutEffect(() => {
    appearance.current = { renderMeshes, revealUniforms }
    motionRig.current = new DealerRetargeter(modelRef.current!)
    homePose.current = motionRig.current.sample(0)
    faceRig.current = new DealerFaceRig(modelRef.current!)
    onReady(group.current)
    return () => { motionRig.current = null; faceRig.current = null; onReady(null) }
  }, [model, onReady, renderMeshes, revealUniforms])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(MOTION_CHANNEL)
    channel.onmessage = ({ data }) => {
      if (data?.type === 'stop') incoming.current = null
      else if (data?.type === 'pose' && validPose(data.sample)) incoming.current = { sample: data.sample, at: performance.now() }
      window.dispatchEvent(new Event(PANEL_EDIT_EVENT))
    }
    return () => channel.close()
  }, [])
  useEffect(() => {
    for (const material of materials.values()) LIT_MATERIALS.add(material)
    return () => {
      entrance.dispose()
      body.dispose()
      disposeDealerHandSkin(model)
      disposeDealerWrist(model)
      for (const material of materials.values()) {
        LIT_MATERIALS.delete(material)
        material.dispose()
      }
    }
  }, [materials, entrance, body, model])
  useEffect(()=>{
    if(!cardHandoff)return
    return cardHandoff.setTargets(body.shuffle.cards)
  },[body,cardHandoff])
  useFrame((_, dt) => {
    const actor = group.current
    const posedModel = modelRef.current
    if (!actor || !posedModel) return
    // Visibility uses the unquantized shared clock, so the first impact cannot
    // land a frame before the skull. The body follows the compositor continuously.
    const live = incoming.current && performance.now() - incoming.current.at < 1000 ? incoming.current.sample : null
    const age = fx.current.impactAge
    // The entire actor is hidden during the card wall and chip flight. Avoid
    // resetting/evaluating its full skeleton while it cannot contribute a pixel.
    // The first impact frame still runs the original absolute-time pose below.
    if (age < 0 && !live && !wasLive.current) {
      actor.visible = false
      motionRef.current = false
      return
    }
    entrance.reset()
    body.reset()
    if(pointTarget?.current) body.chip.pointTarget.lerp(posedModel.worldToLocal(pointTarget.current.clone()),1-Math.exp(-dt/.16))
    if (live) motionRig.current?.apply(live)
    else if (wasLive.current && homePose.current) motionRig.current?.apply(homePose.current)
    const entry = dealerEntrance(age)
    let faceMoved = false
    if (!live && faceRig.current) {
      const bodyTime=Math.max(0,age-DEALER_ENTRANCE_END)
      const fade=Math.min(1,bodyTime/1.4)
      if(bodyTime>0) body.apply(Math.max(0,age-DEALER_IDLE_START),dealerBodyAmount*fade*fade*(3-2*fade),faceSettings.speed,faceSettings.idle?faceSettings.amount*faceSettings.acting:0,fade*fade*(3-2*fade),bodyTime)
      const idle = mouseLook(facePose(faceSettings, Math.max(0, age-DEALER_IDLE_START)), faceSettings, posedModel, dt)
      const pose = age < DEALER_ENTRANCE_END ? blendEntranceFace(entranceFace(faceSettings, age), idle, entry.idle) : idle
      faceMoved = faceRig.current.apply(pose, age < DEALER_IDLE_START ? Infinity : dt)
      entrance.apply(age)
      applyDealerCardAction(body.shuffle,age,Math.max(0,age-DEALER_IDLE_START)*faceSettings.speed,dealerBodyAmount>0)
      applyDealerPointAction(body.chip,age,Math.max(0,age-DEALER_IDLE_START)*faceSettings.speed,dealerBodyAmount>0)
    }
    const state = live ? { visible: true, bodyReveal: 1, blink: 0 } : dealerActing(fx.current.impactAge)
    actor.visible = state.visible
    const last = previous.current
    motionRef.current = !!live || !!faceMoved || (age>=DEALER_ENTRANCE_END && dealerBodyAmount>0) || (age >= 0 && age < DEALER_ENTRANCE_END) || wasLive.current || last.bodyReveal !== state.bodyReveal || last.visible !== state.visible
    wasLive.current = !!live
    cardHandoff?.setEnabled(!live&&dealerBodyAmount>0)
    // All body materials share this graph's uniforms. Update them once and walk
    // cached mesh handles rather than traversing the skeleton and its ancestors.
    const renderState = appearance.current
    renderState.revealUniforms.impactReturn.value = state.bodyReveal
    renderState.revealUniforms.impactNoise.value = getTune().hitRevealNoise
    updateDealerAppearance(renderState.renderMeshes, state.bodyReveal, entry.hatVisible, !!live, !!cardHandoff?.active)
    previous.current = state
  }, .5) // after the chip reports impact at priority 0, before the compositor at 1
  return <group ref={group} name="SkeletonDealer" position={placement.position} rotation={placement.rotation} scale={placement.scale} visible={false}>
    <primitive ref={modelRef} object={model} dispose={null} />
  </group>
}

useGLTF.preload(SKELETON_DEALER_URL)
