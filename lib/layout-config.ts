export const DESKTOP_LAYOUT = {
  LEFT_MARGIN: 0.15,
  LEFT_CARD: 0.40,
  GAP: 0.05,
  RIGHT_CARD: 0.30,
  RIGHT_MARGIN: 0.10,
  RIGHT_CARD_LEFT: 0.60,
} as const

export const MOBILE_LAYOUT = {
  CARD_WIDTH: 0.80,
  RIGHT_CARD_WIDTH: 0.85,
  TOP_MARGIN: 0.15,
  CARDS_GAP: 80,
  CARD_HEIGHT_RATIO: 0.30,
  DOTS_OFFSET_RATIO: 0.25,
} as const

export const MD_BREAKPOINT = 768
export const BASE_RIGHT_CARD_WIDTH = 448

export const SCALE_LIMITS = {
  MIN: 0.1,
  MAX: 3.0,
} as const
