'use client'

/**
 * The card set as PRINT: the raw canvases, no scene, no lamp, no watercolour.
 *
 * The 3D sheet answers "does the deck sit right on the table". This answers "is
 * the printing correct", which is a different question and one the compositor
 * pass actively gets in the way of: a pip half a millimetre out of place is
 * invisible under a wash that is deliberately smearing the ink.
 */
import { useEffect, useRef } from 'react'
import { RANKS, SUITS, cardBackCanvas, cardFaceCanvas, loadCourtPlates, type Rank, type Suit } from './card-art'
import { LINK_HREF, LINK_KEYS, linkCardFaceCanvas } from './playing-cards'

export default function CardPrint({
  suit,
  rank,
  res = 620,
  back = false,
  links = false,
}: {
  suit?: Suit
  rank?: Rank
  res?: number
  back?: boolean
  links?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    let live = true
    const draw = () => {
    el.innerHTML = ''
    const cards: { rank: Rank; suit: Suit }[] = []
    if (rank) for (const s of SUITS) cards.push({ rank, suit: s })
    else if (suit) for (const r of RANKS) cards.push({ rank: r, suit })
    else for (const s of SUITS) for (const r of RANKS) cards.push({ rank: r, suit: s })
    if (links) {
      for (const k of LINK_KEYS) {
        const cv = linkCardFaceCanvas(k, LINK_HREF[k], res)
        cv.style.width = '100%'
        cv.style.display = 'block'
        cv.style.borderRadius = '3%'
        cv.style.boxShadow = '0 1px 4px rgba(0,0,0,0.45)'
        el.appendChild(cv)
      }
      return
    }
    if (back) {
      const c = cardBackCanvas(res)
      c.style.width = '100%'
      el.appendChild(c)
      return
    }
    for (const c of cards) {
      const cv = cardFaceCanvas(c.rank, c.suit, res)
      cv.style.width = '100%'
      cv.style.display = 'block'
      cv.style.borderRadius = '3%'
      cv.style.boxShadow = '0 1px 4px rgba(0,0,0,0.45)'
      el.appendChild(cv)
    }
    }
    draw()
    // plates are files on disk, so the drawn figure goes up now and the page
    // redraws once if any generated plate turns out to exist
    loadCourtPlates().then((got) => {
      if (live && got.length) draw()
    })
    return () => {
      live = false
    }
  }, [suit, rank, res, back, links])
  const cols = links ? 3 : back ? 1 : rank ? 4 : suit ? 7 : 13
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2b2f2b', overflow: 'auto', zIndex: 100000 }}>
      <div
        ref={host}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '0.7vw',
          padding: '1vw',
          maxWidth: back ? '30vw' : 'none',
        }}
      />
    </div>
  )
}
