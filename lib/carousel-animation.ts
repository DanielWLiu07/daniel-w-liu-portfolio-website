import { animationConstants } from '@/data/projects'

const { WHEEL_ACCEL, FRICTION, MAX_VELOCITY, AUTO_SCROLL_VELOCITY, MIN_SCROLL_THRESHOLD } = animationConstants

export function handleWheelScroll(
  event: WheelEvent,
  velocityRef: React.MutableRefObject<number>,
  isManualScrollingRef: React.MutableRefObject<boolean>
) {
  event.preventDefault()

  const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const absDelta = Math.abs(primaryDelta)

  if (absDelta < MIN_SCROLL_THRESHOLD) return

  // Trackpad sends many small pixel-based deltas; mouse wheel sends fewer large ones.
  // Dampen trackpad input more aggressively.
  const isTrackpad = event.deltaMode === 0 && absDelta < 50
  const sensitivity = Math.pow(absDelta / 100, 0.85) * (isTrackpad ? 0.3 : 1)
  const impulse = -Math.sign(primaryDelta) * sensitivity * WHEEL_ACCEL * 100

  velocityRef.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocityRef.current + impulse))
  isManualScrollingRef.current = true
}

export function updateScrollVelocity(
  isManualScrollingRef: React.MutableRefObject<boolean>,
  velocityRef: React.MutableRefObject<number>,
  autoScrollDirectionRef: React.MutableRefObject<number>
) {
  if (isManualScrollingRef.current) {
    if (Math.abs(velocityRef.current) > 0.01) {
      autoScrollDirectionRef.current = velocityRef.current > 0 ? 1 : -1
    }

    velocityRef.current *= FRICTION

    if (Math.abs(velocityRef.current) < AUTO_SCROLL_VELOCITY * 1.5) {
      velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
      isManualScrollingRef.current = false
    }
  } else {
    velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
  }
}
