'use client'

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector2, type Object3D } from 'three'
import type { FacePose } from './face-rig'
import type { FaceSettings } from './face-settings'
import { MouseLook, mouseLookAngles } from './mouse-look'
import { PANEL_EDIT_EVENT } from '@/components/panels/panel-events'

export function useMouseLook() {
  const {gl,camera}=useThree()
  const pointer=useRef<Vector2|null>(null)
  const look=useRef(new MouseLook())
  useEffect(()=>{
    const canvas=gl.domElement
    const clear=()=>{pointer.current=null}
    const move=(event:PointerEvent)=>{
      if(event.pointerType && event.pointerType!=='mouse') {clear();return}
      const box=canvas.getBoundingClientRect()
      const x=(event.clientX-box.left)/box.width, y=(event.clientY-box.top)/box.height
      pointer.current=box.width>0 && box.height>0 && x>=0 && x<=1 && y>=0 && y<=1 ? new Vector2(x*2-1,1-y*2) : null
      window.dispatchEvent(new Event(PANEL_EDIT_EVENT))
    }
    const leave=(event:PointerEvent)=>{if(!event.relatedTarget) clear()}
    window.addEventListener('pointermove',move,{passive:true,capture:true})
    window.addEventListener('pointerout',leave)
    window.addEventListener('blur',clear)
    window.addEventListener('scroll',clear,true)
    return ()=>{
      window.removeEventListener('pointermove',move,true)
      window.removeEventListener('pointerout',leave)
      window.removeEventListener('blur',clear)
      window.removeEventListener('scroll',clear,true)
    }
  },[gl])
  return (pose:FacePose,settings:FaceSettings,root:Object3D,delta:number)=>{
    const head=root.getObjectByName('Head')
    const target=pointer.current && head && settings.followMouse ? mouseLookAngles(pointer.current,camera,root,head) : null
    return look.current.apply(pose,settings,target,delta)
  }
}
