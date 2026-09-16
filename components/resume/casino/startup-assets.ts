/** Plain data only: the route must not import Three or the scene to start downloads. */
/**
 * Faces in panel order. KatieRoze is the table's own hand. Its shipped woff2
 * was re-subsetted from a 24MB original to restore J/C/K/T/R; keep the complete
 * display subset. See fonts-original/README.txt before adding new characters.
 */
export const JACK_FONTS: { key: string; label: string; url: string }[] = [
  { key: 'KatieRoze', label: "KatieRoze (the table's own hand)", url: '/fonts/KatieRoze-display-512.woff2' },
  { key: 'JkFredericka', label: 'Fredericka (inked wood type)', url: '/fonts/FrederickatheGreat-Regular.woff2' },
  { key: 'JkFastBlaze', label: 'Fast Blaze (brush)', url: '/fonts/FAST%20BLAZE.woff2' },
  { key: 'JkAtop', label: 'Atop (heavy round)', url: '/fonts/Atop.ttf' },
  { key: 'JkMochibop', label: 'Mochibop (bubble)', url: '/fonts/MochibopBold-Demo.woff2' },
  { key: 'JkAncient', label: 'Ancient Wedding (script)', url: '/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.woff2' },
  { key: 'JkWedding', label: 'Wedding (script)', url: '/shared/fonts/weddingday-font/WeddingdayPersonalUseRegular-1Gvo0.ttf' },
  { key: 'JkArcade', label: 'Arcade (pixel)', url: '/fonts/ARCADECLASSIC.TTF' },
]

export const CASINO_STARTUP_IMAGES = [
  '/resume/resume-page1-lossless.webp',
  '/textures/royal-flush/delivery/casino-back.webp',
  ...['hearts', 'spades'].flatMap(suit => ['10', 'J', 'Q', 'K', 'A'].map(rank => `/textures/royal-flush/delivery/${rank}-${suit}.webp`)),
  '/textures/royal-flush/delivery/J-clubs.webp',
  '/textures/royal-flush/delivery/J-diamonds.webp',
]
