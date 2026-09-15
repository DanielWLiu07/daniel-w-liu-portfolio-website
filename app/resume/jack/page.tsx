'use client'

import dynamic from 'next/dynamic'

const CasinoResume = dynamic(() => import('@/components/resume/casino/casino-resume'), { ssr: false })
export default function JackEditorPage() {
  return <CasinoResume jackEditing />
}
