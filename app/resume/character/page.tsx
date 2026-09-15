'use client'

import dynamic from 'next/dynamic'

const CharacterStudio = dynamic(() => import('@/components/resume/character-studio'), { ssr: false })

export default function CharacterPage() {
  return <CharacterStudio />
}
