'use client'

/**
 * /cards: the playing card set on one sheet, so a pip layout or a court plate can
 * be read rather than guessed at.
 *
 * default   all 52, four rows of thirteen, shot straight down
 * ?suit=    one suit (spades, hearts, diamonds, clubs), larger
 * ?rank=    one rank across all four suits, at print resolution
 * ?back     print the deck's back instead of the faces
 * ?links    the calling cards (LinkedIn, Devpost, GitHub), clickable
 * ?print    the raw canvases, no scene and no watercolour, to judge the printing
 * ?fan      the royal flush on the felt under the real lamp, turning
 * ?still    stop the fan turning
 * ?res=     override the face resolution in pixels across
 * ?comp=    which compositor graph to print through (night, watercolor, plain)
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Rank, Suit } from '@/components/resume/casino/card-art'

const CardsStage = dynamic(() => import('@/components/resume/casino/cards-stage'), { ssr: false })
const CardPrint = dynamic(() => import('@/components/resume/casino/card-print'), { ssr: false })

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export default function CardsPage() {
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  const suit = q.get('suit')
  const rank = q.get('rank')
  const res = q.get('res')
  const pickedSuit = suit && SUITS.includes(suit) ? (suit as Suit) : undefined
  const pickedRank = rank && RANKS.includes(rank) ? (rank as Rank) : undefined
  if (q.has('print')) {
    return (
      <CardPrint
        suit={pickedSuit}
        rank={pickedRank}
        res={res ? Number(res) : 620}
        back={q.has('back')}
        links={q.has('links')}
      />
    )
  }
  return (
    <CardsStage
      comp={q.get('comp') ?? 'night'}
      mode={q.has('links') ? 'links' : q.has('fan') ? 'fan' : 'sheet'}
      suit={pickedSuit}
      rank={pickedRank}
      res={res ? Number(res) : undefined}
      faceDown={q.has('back')}
      spin={!q.has('still')}
    />
  )
}
