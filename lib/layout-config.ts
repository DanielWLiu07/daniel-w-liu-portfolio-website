/**
 * Shared layout configuration for project cards
 * All values add up to 100% for perfect percentage-based layout
 */

// Desktop layout: LEFT_MARGIN + LEFT_CARD + GAP + RIGHT_CARD + RIGHT_MARGIN = 100%
// 15% + 40% + 5% + 30% + 10% = 100%
export const DESKTOP_LAYOUT = {
  LEFT_MARGIN: 0.15,    // 15%
  LEFT_CARD: 0.40,      // 40%
  GAP: 0.05,            // 5%
  RIGHT_CARD: 0.30,     // 30%
  RIGHT_MARGIN: 0.10,   // 10%
  // Derived values
  RIGHT_CARD_LEFT: 0.60, // 15% + 40% + 5% = 60% (left position of right card)
} as const

// Mobile layout: stacked vertically, centered
export const MOBILE_LAYOUT = {
  CARD_WIDTH: 0.80,      // 80% of viewport width for left card
  RIGHT_CARD_WIDTH: 0.85, // 85% of viewport width for right card
  VERTICAL_GAP: 0.05,    // 5% gap between cards
  LEFT_CARD_TOP: 0.20,   // 20% up from center for left card
  RIGHT_CARD_TOP: 0.60,  // 60% from top for right card
} as const

// Breakpoint
export const SM_BREAKPOINT = 640

// Base dimensions
export const BASE_RIGHT_CARD_WIDTH = 448 // max-w-md in pixels

// Scale limits
export const SCALE_LIMITS = {
  MIN: 0.1,
  MAX: 1.5,
} as const
