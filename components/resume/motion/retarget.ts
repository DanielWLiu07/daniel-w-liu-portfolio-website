import { Bone, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import type { CaptureFrame, Landmark, PoseSample } from './types'

const point = (p: Landmark) => new Vector3(p.x, -p.y, -p.z)
const valid = (p?: Landmark, checkVisibility = false) => p && [p.x, p.y, p.z].every(Number.isFinite) && (!checkVisibility || (p.visibility ?? 1) > .45)
const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0))

function basis(x: Vector3, up: Vector3): Quaternion | null {
  if (x.lengthSq() < 1e-8 || up.lengthSq() < 1e-8) return null
  x.normalize()
  const z = new Vector3().crossVectors(x, up).normalize()
  if (z.lengthSq() < .5) return null
  const y = new Vector3().crossVectors(z, x).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

function torso(frame: CaptureFrame) {
  const p = frame.pose
  if (![11, 12].every(i => valid(p[i], true))) return null
  const up = [23, 24].every(i => valid(p[i], true))
    ? point(p[11]).add(point(p[12])).sub(point(p[23])).sub(point(p[24])) : new Vector3(0, 1, 0)
  return basis(point(p[11]).sub(point(p[12])), up)
}

function head(frame: CaptureFrame) {
  const p = frame.face
  if (![33, 263, 10, 152].every(i => valid(p[i]))) return null
  const at = (i: number) => point(p[i]).multiply(new Vector3(1, 1 / frame.aspect, 1))
  return basis(at(263).sub(at(33)), at(10).sub(at(152)))
}

export function skullExpressions(values: Record<string, number>) {
  const n = (key: string) => clamp(values[key] ?? 0)
  return {
    blinkLeft: n('eyeBlinkLeft'), blinkRight: n('eyeBlinkRight'),
    squintLeft: n('eyeSquintLeft'), squintRight: n('eyeSquintRight'),
    browRaiseLeft: Math.max(n('browOuterUpLeft'), n('browInnerUp')),
    browRaiseRight: Math.max(n('browOuterUpRight'), n('browInnerUp')),
    browDownLeft: n('browDownLeft'), browDownRight: n('browDownRight'),
    smile: (n('mouthSmileLeft') + n('mouthSmileRight')) / 2,
    frown: (n('mouthFrownLeft') + n('mouthFrownRight')) / 2,
    jawOpen: n('jawOpen'),
  }
}

/** Retarget directions, not landmark positions: the dealer keeps his own bone lengths. */
export class DealerRetargeter {
  readonly bones = new Map<string, Bone>()
  readonly rest = new Map<string, Quaternion>()
  private world = new Map<string, Quaternion>()
  private restScales = new Map<string, Vector3>()
  private directions = new Map<string, Vector3>()
  private palms = new Map<string, Quaternion>()
  private neutralTorso = new Quaternion()
  private neutralHead = new Quaternion()
  private morphs: Mesh[] = []

  constructor(readonly root: Object3D) {
    root.updateMatrixWorld(true)
    root.traverse(object => {
      if ((object as Bone).isBone) {
        const bone = object as Bone
        this.bones.set(bone.name, bone)
        this.rest.set(bone.name, bone.quaternion.clone())
        this.restScales.set(bone.name, bone.scale.clone())
        const world = bone.getWorldQuaternion(new Quaternion())
        this.world.set(bone.name, world)
        const child = bone.children.find(child => (child as Bone).isBone)
        this.directions.set(bone.name, child
          ? child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize()
          : new Vector3(0, 1, 0).applyQuaternion(world))
      }
      if ((object as Mesh).isMesh && (object as Mesh).morphTargetInfluences) this.morphs.push(object as Mesh)
    })
    for (const side of ['Left', 'Right']) {
      const pos = (name: string) => this.bones.get(side + name)!.getWorldPosition(new Vector3())
      const palm = basis(pos('Index1').sub(pos('Pinky1')), pos('Middle1').sub(pos('Hand')))
      if (palm) this.palms.set(side, palm)
    }
  }

  calibrate(frame: CaptureFrame): boolean {
    const body = torso(frame), face = head(frame)
    if (!body || !face) return false
    this.neutralTorso.copy(body).invert()
    this.neutralHead.copy(face).invert()
    return true
  }

  update(frame: CaptureFrame | null, dt: number, smoothing: number) {
    const alpha = 1 - Math.exp(-Math.min(.1, dt) / Math.max(.015, smoothing))
    const previous = new Map([...this.bones].map(([name, bone]) => [name, bone.quaternion.clone()]))
    // Solve on the rest rig, then smooth LOCAL rotations once, in parent order.
    for (const [name, bone] of this.bones) bone.quaternion.copy(this.rest.get(name)!)
    this.root.updateMatrixWorld(true)
    const worldRotation = (name: string, desired: Quaternion) => {
      const bone = this.bones.get(name)
      if (!bone) return
      const parent = bone.parent!.getWorldQuaternion(new Quaternion()).invert()
      bone.quaternion.copy(parent.multiply(desired))
      this.root.updateMatrixWorld(true)
    }
    const aim = (name: string, from?: Landmark, to?: Landmark) => {
      if (!valid(from) || !valid(to) || !this.world.has(name)) return
      const target = point(to!).sub(point(from!))
      if (target.lengthSq() < 1e-8) return
      const rotation = new Quaternion().setFromUnitVectors(this.directions.get(name)!, target.normalize())
      worldRotation(name, rotation.multiply(this.world.get(name)!))
    }
    if (frame) {
      const body = torso(frame), face = head(frame)
      if (body) worldRotation('Spine02', body.multiply(this.neutralTorso).multiply(this.world.get('Spine02')!))
      if (face) worldRotation('Head', face.multiply(this.neutralHead).multiply(this.world.get('Head')!))
      for (const [side, shoulder, elbow, wrist] of [['Left', 11, 13, 15], ['Right', 12, 14, 16]] as const) {
        if ([shoulder, elbow].every(i => valid(frame.pose[i], true))) aim(`${side}Arm`, frame.pose[shoulder], frame.pose[elbow])
        if ([elbow, wrist].every(i => valid(frame.pose[i], true))) aim(`${side}ForeArm`, frame.pose[elbow], frame.pose[wrist])
        const hand = side === 'Left' ? frame.leftHand : frame.rightHand
        if (hand.length !== 21 || !hand.every(p => valid(p))) continue
        const palm = basis(point(hand[5]).sub(point(hand[17])), point(hand[9]).sub(point(hand[0])))
        if (palm && this.palms.has(side)) worldRotation(`${side}Hand`, palm.multiply(this.palms.get(side)!.clone().invert()).multiply(this.world.get(`${side}Hand`)!))
        for (const [finger, start] of [['Thumb', 1], ['Index', 5], ['Middle', 9], ['Ring', 13], ['Pinky', 17]] as const) {
          for (let joint = 1; joint <= 3; joint++) aim(`${side}${finger}${joint}`, hand[start + joint - 1], hand[start + joint])
        }
      }
    }
    for (const [name, bone] of this.bones) {
      const target = bone.quaternion.clone()
      bone.quaternion.copy(previous.get(name)!).slerp(target, alpha)
    }
    const expression = skullExpressions(frame?.expressions ?? {})
    for (const mesh of this.morphs) for (const [name, i] of Object.entries(mesh.morphTargetDictionary!)) {
      const target = expression[name as keyof typeof expression] ?? 0
      mesh.morphTargetInfluences![i] += (target - mesh.morphTargetInfluences![i]) * alpha
    }
    this.root.updateMatrixWorld(true)
  }

  sample(time: number): PoseSample {
    const expressions: Record<string, number> = {}
    for (const mesh of this.morphs) for (const [name, i] of Object.entries(mesh.morphTargetDictionary!)) expressions[name] = mesh.morphTargetInfluences![i]
    return { time, bones: Object.fromEntries([...this.bones].map(([name, bone]) => [name, bone.quaternion.toArray()])), expressions,
      scales: Object.fromEntries([...this.bones].filter(([,bone]) => !bone.scale.equals(new Vector3(1,1,1))).map(([name,bone]) => [name,bone.scale.toArray()])) }
  }

  apply(sample: PoseSample) {
    for (const [name, bone] of this.bones) {
      const q = sample.bones[name]
      if (q) bone.quaternion.fromArray(q).normalize()
      const scale = sample.scales?.[name]
      if (scale) bone.scale.fromArray(scale)
      else bone.scale.copy(this.restScales.get(name)!)
    }
    for (const mesh of this.morphs) for (const [name, i] of Object.entries(mesh.morphTargetDictionary!)) mesh.morphTargetInfluences![i] = sample.expressions[name] ?? 0
    this.root.updateMatrixWorld(true)
  }
}
