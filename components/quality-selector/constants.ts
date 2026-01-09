export const QUALITY_OPTIONS = {
  high: {
    title: 'High Quality',
    features: [
      { icon: '✨', text: 'Smooth Animations' },
      { icon: '🎨', text: 'Full Effects' },
      { icon: '⭐', text: 'Best Experience' },
    ],
    imageSrc: '/quality/images/sticky_quality_outline_1.png',
  },
  low: {
    title: 'Low Quality',
    features: [
      { icon: '🖼️', text: 'Static Images' },
      { icon: '⚡', text: 'Reduced Effects' },
      { icon: '🚀', text: 'Optimized Performance' },
    ],
    imageSrc: '/quality/images/sticky_quality_outline_2.png',
  },
} as const

export const BACKGROUND_IMAGES = {
  selfie: {
    src: '/quality/images/selfie_outline.png',
    alt: 'Daniel W Liu',
    className: '-scale-x-110 scale-y-110 rotate-[20deg]',
    position: 'fixed left-0 top-0 -ml-80 md:-ml-20 -mt-5',
  },
  cat: {
    src: '/quality/images/cat_tongue_outline.png',
    alt: 'Bongo',
    className: '-scale-x-125 scale-y-125 -rotate-[30deg]',
    position: 'fixed right-0 top-0 -mr-80 md:-mr-20 mt-10',
  },
} as const

export const ANIMATION_CONFIG = {
  entrance: {
    title: { y: -30, opacity: 0, duration: 0.8 },
    subtitle: { y: -20, opacity: 0, duration: 0.6, offset: '-=0.4' },
    selfie: { x: -150, y: 100, rotation: -45, finalRotation: -18, duration: 0.8, offset: '-=0.3' },
    waterloo: { x: -300, y: 300, rotation: -70, finalRotation: -10, duration: 0.8, offset: '-=0.75' },
    highQuality: { x: -50, y: 50, rotation: -25, finalRotation: -5, duration: 0.8, offset: '-=0.7' },
    lowQuality: { x: 50, y: 50, rotation: 25, finalRotation: 4, duration: 0.8, offset: '-=0.7' },
    cat: { x: 150, y: 100, rotation: 45, finalRotation: 18, duration: 0.8, offset: '-=0.7' },
    helper: { y: 20, opacity: 0, finalOpacity: 0.8, duration: 0.6, offset: '-=0.4' },
    socials: { x: 100, y: 50, rotation: 25, duration: 0.8, offset: '-=0.6' },
  },
  exit: {
    selected: { scale: 1.15, duration: 0.6 },
    unselected: { rotation: 90, opacity: 0, duration: 0.6 },
    backgrounds: { rotation: 120, opacity: 0, duration: 0.7 },
    waterloo: { x: -300, y: 300, rotation: -90, opacity: 0, duration: 0.7 },
    final: { scale: 1.8, opacity: 0, duration: 0.5 },
  },
} as const
