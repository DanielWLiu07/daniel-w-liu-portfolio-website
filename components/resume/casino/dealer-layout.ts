/** Shared defaults for the character's scene placement and its saved controls. */
export const DEALER_DEFAULTS = {
  dealerSize: 2.25,
  dealerX: 0,
  dealerY: -.32,
  dealerZ: 0,
  dealerYaw: 0,
  dealerPitch: 0,
  dealerRoll: 0,
}

export type DealerControls = typeof DEALER_DEFAULTS
export const DEALER_MOTION_DEFAULTS={dealerBodyAmount:1}
export type DealerMotionControls=typeof DEALER_MOTION_DEFAULTS
export const DEALER_KEYS = Object.keys(DEALER_DEFAULTS) as (keyof DealerControls)[]
export const DEALER_MOTION_KEYS=Object.keys(DEALER_MOTION_DEFAULTS) as (keyof DealerMotionControls)[]
export const DEALER_ALL_KEYS=[...DEALER_KEYS,...DEALER_MOTION_KEYS]
export const DEALER_MOTION_RANGES:Record<keyof DealerMotionControls,[number,number,number]>={dealerBodyAmount:[0,1.5,.05]}
export const DEALER_MOTION_LABELS={dealerBodyAmount:'Body · movement amount'}
export const DEALER_RANGES: Record<keyof DealerControls, [number, number, number]> = {
  dealerSize: [.25, 5, .05],
  dealerX: [-10, 10, .05],
  dealerY: [-5, 5, .05],
  dealerZ: [-10, 10, .05],
  dealerYaw: [-180, 180, 1],
  dealerPitch: [-90, 90, 1],
  dealerRoll: [-90, 90, 1],
}

export const DEALER_LABELS: Record<keyof DealerControls, string> = {
  dealerSize: 'Character · size',
  dealerX: 'Character · left / right',
  dealerY: 'Character · up / down',
  dealerZ: 'Character · back / front',
  dealerYaw: 'Character · turn (°)',
  dealerPitch: 'Character · lean (°)',
  dealerRoll: 'Character · sideways tilt (°)',
}
