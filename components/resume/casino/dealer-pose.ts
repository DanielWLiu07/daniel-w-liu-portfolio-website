import { Euler, Object3D, Vector3 } from 'three'
import { DealerArmRig } from './dealer-arms'
import { prepareDealerWrist } from './dealer-wrist'
import { prepareDealerHandSkin } from './dealer-hand-skin'
import { prepareDealerNeck } from './dealer-neck'
import manifest from '@/public/models/casino-dealer-v3.json'
import webManifest from '@/public/models/casino-dealer-v3-web.json'
import compactManifest from '@/public/models/casino-dealer-v3-compact.json'
import meshoptManifest from '@/public/models/casino-dealer-v3-meshopt.json'
import leanManifest from '@/public/models/casino-dealer-v3-lean.json'
import { DEALER_DEFAULTS, type DealerControls } from './dealer-layout'
import { impactBurstMotion } from './impact-eye-motion'

// A rebuilt authored model takes precedence until its delivery copy is regenerated.
export const SKELETON_DEALER_URL = leanManifest.sourceModel === manifest.model ? leanManifest.model
  : meshoptManifest.sourceModel === manifest.model ? meshoptManifest.model
  : compactManifest.sourceModel === manifest.model ? compactManifest.model
  : webManifest.sourceModel === manifest.model ? webManifest.model : manifest.model
export const DEALER_HAND_HEIGHT = 1.175

/** Pose in the asset's metre-scale frame, before placing its parent in the set. */
export function poseDealerAtTable(root: Object3D) {
  prepareDealerWrist(root)
  prepareDealerHandSkin(root)
  prepareDealerNeck(root)
  root.updateWorldMatrix(true,true)
  const arms=new DealerArmRig(root)
  for(const [side,sign] of [['Left',1],['Right',-1]] as const) {
    arms.arm(side,new Vector3(sign*.27,DEALER_HAND_HEIGHT,.405),
      new Vector3(sign*.34,1.08,.06),new Vector3(0,-1,0),new Vector3(-sign*.12,-.04,1))
  }
  root.updateWorldMatrix(true,true)
}

export function dealerPlacement(feltY: number, chordZ: number, rail: number, fit = 1, controls: DealerControls = DEALER_DEFAULTS) {
  const scale = 2 * fit * controls.dealerSize
  const rad = Math.PI / 180
  const rotation: [number, number, number] = [controls.dealerPitch * rad, controls.dealerYaw * rad, controls.dealerRoll * rad]
  // Scale and turn around the waist at the rail, rather than the buried feet.
  const anchor = new Vector3(0, 1.01, .33).multiplyScalar(scale).applyEuler(new Euler(...rotation))
  return {
    scale,
    rotation,
    position: [controls.dealerX - anchor.x, feltY + controls.dealerY - anchor.y, chordZ - rail + controls.dealerZ - anchor.z] as [number, number, number],
  }
}

/** Skull lands on the impact; clothing and limbs join the shared screen-space paint return. */
export function dealerActing(impactAge: number) {
  const blinkAt = (Math.max(0, impactAge - 4.3) % 6.4)
  const blink = impactAge < 4.3 || blinkAt > .24 ? 0 : Math.sin(blinkAt / .24 * Math.PI) ** 2 * .78
  return { visible: impactAge >= 0, bodyReveal: impactBurstMotion(impactAge).reveal, blink }
}

export function dealerPart(object: Object3D): string {
  let owner = object
  while (!owner.userData.partGroup && owner.parent) owner = owner.parent
  return owner.userData.partGroup ?? object.name
}

export function isDealerSkull(object: Object3D): boolean {
  return ['Skull', 'Jaw', 'MouthInterior'].includes(dealerPart(object))
}
