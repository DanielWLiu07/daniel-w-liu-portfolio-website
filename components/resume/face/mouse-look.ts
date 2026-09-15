import { Camera, Object3D, Quaternion, Vector2, Vector3 } from 'three'
import type { FacePose } from './face-rig'
import type { FaceSettings } from './face-settings'

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))

/** Aim relative to the head's screen position, on a plane parallel to the camera. */
export function mouseLookAngles(pointer:Vector2, camera:Camera, root:Object3D, head:Object3D):[number,number] {
  const origin=head.getWorldPosition(new Vector3())
  const projected=origin.clone().project(camera)
  const target=new Vector3(pointer.x,pointer.y,projected.z).unproject(camera)
  const offset=target.sub(origin).applyQuaternion(root.getWorldQuaternion(new Quaternion()).invert())
  const distance=Math.max(.1,camera.getWorldPosition(new Vector3()).distanceTo(origin)*.30)
  const degrees=180/Math.PI
  return [clamp(-Math.atan2(offset.y,distance)*degrees,-20,20),clamp(Math.atan2(offset.x,distance)*degrees,-35,35)]
}

/** Blend attention in and out; keep the last target during the return to idle. */
export class MouseLook {
  private weight=0
  private angles:[number,number]=[0,0]
  apply(pose:FacePose, settings:FaceSettings, target:[number,number]|null, delta:number):FacePose {
    const active=settings.followMouse && target!==null
    if(active) {
      const turn=1-Math.exp(-Math.max(0,Math.min(delta,.1))/.16)
      this.angles=[this.angles[0]+(target[0]-this.angles[0])*turn,this.angles[1]+(target[1]-this.angles[1])*turn]
    }
    const alpha=1-Math.exp(-Math.max(0,Math.min(delta,.1))/(active ? .16 : .45))
    this.weight+=((active ? 1 : 0)-this.weight)*alpha
    if(this.weight<1e-5) {this.weight=0;return pose}
    const w=this.weight
    return {...pose,head:[
      clamp(pose.head[0]*(1-.6*w)+(settings.headPitch*.6+this.angles[0])*w,-25,25),
      clamp(pose.head[1]*(1-.85*w)+(settings.headYaw*.85+this.angles[1])*w,-42,42),
      pose.head[2],
    ]}
  }
}
