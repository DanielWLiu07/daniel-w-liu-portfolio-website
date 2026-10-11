import { cardArtUrl } from './card-art-url'
/** Plain data only: the route must not import Three or the scene to start downloads. */
/**
 * Faces in panel order. KatieRoze is the table's own hand. Its shipped woff2
 * was re-subsetted from a 24MB original to restore J/C/K/T/R; keep the complete
 * display subset. See fonts-original/README.txt before adding new characters.
 */
export const JACK_FONTS: { key: string; label: string; url: string }[] = [
  { key: 'KatieRoze', label: "KatieRoze (the table's own hand)", url: '/fonts/KatieRoze-display-512.woff2' },
  { key: 'JkFredericka', label: 'Fredericka (inked wood type)', url: '/fonts/FrederickatheGreat-core-v1.woff2' },
  { key: 'JkFastBlaze', label: 'Fast Blaze (brush)', url: '/fonts/FAST%20BLAZE.woff2' },
  { key: 'JkAtop', label: 'Atop (heavy round)', url: '/fonts/Atop.woff2' },
  { key: 'JkMochibop', label: 'Mochibop (bubble)', url: '/fonts/MochibopBold-Demo.woff2' },
  { key: 'JkAncient', label: 'Ancient Wedding (script)', url: '/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.woff2' },
  { key: 'JkWedding', label: 'Wedding (script)', url: '/fonts/Weddingday.woff2' },
  { key: 'JkArcade', label: 'Arcade (pixel)', url: '/fonts/ARCADECLASSIC.woff2' },
]

export const CASINO_STARTUP_IMAGES = [
  '/resume/resume-page1-lossless.webp',
  cardArtUrl('casino-back'),
  ...['hearts', 'spades'].flatMap(suit => ['10', 'J', 'Q', 'K', 'A'].map(rank => cardArtUrl(`${rank}-${suit}`))),
  cardArtUrl('J-clubs'),
  cardArtUrl('J-diamonds'),
]

/**
 * What the scene still needs when it starts after the intro (the intro video
 * played it): the folder's page, and the dealer's cards (dealer-shuffle.ts).
 * The intro's card wall and royal flush are never built.
 */
export const CASINO_AFTER_INTRO_IMAGES = [
  '/resume/resume-page1-lossless.webp',
  cardArtUrl('casino-back'),
  cardArtUrl('K-hearts'),
  cardArtUrl('A-hearts'),
]

/** The watercolour paper the compose pass paints through. */
export const PAPER_TEXTURE_URL = '/models/paper-delivery.webp'
/** The recorded paper-wall motion; portrait canvases (aspect < .9) get their own take. */
export const paperRecordingUrl = (portrait: boolean) => `/animations/paper-${portrait ? 'portrait' : 'desktop'}-v1.bin.gz`

/**
 * The opening beat, pre-rendered from the live scene on a frame-exact clock
 * (one 60 fps capture, encoded at 30). It plays the moment the page opens
 * while the scene loads and compiles underneath, held at frame 0; at the
 * video's last frame the scene starts that many seconds into the beat and the
 * video fades off it. Desktop shapes only for now (the scene reframes itself
 * for portrait).
 */
export const INTRO_VIDEO = {
  src: '/resume/intro/desktop-v4.mp4?v=4',
  poster: '/resume/intro/desktop-v4.webp?v=4',
  /**
   * The earliest beat time the live scene takes over at: 0.9 s after the chip
   * hits the table (6.36 s), as the last of the card wall leaves the frame.
   * Sooner, the wall would have to launch mid-flight, and its launch pose
   * depends on where the camera was at 3.5 s. A scene ready later cuts later.
   */
  seconds: 7.3,
  /** the video's last frame (it runs on with the dealer idling): the latest cut */
  end: 16,
  fps: 30,
  /** the capture's frame; the scene renders at this aspect, cropped the same way, until the window changes */
  aspect: 16 / 9,
  /** the capture's painterly pass width: 1920 px at the night graph's 0.75 render scale */
  renderWidth: 1440,
}
