export function triggerSvgAnimations(svg: SVGSVGElement | null) {
  if (!svg) return
  svg.querySelectorAll('animate').forEach((anim) => {
    try {
      (anim as SVGAnimateElement).beginElement()
    } catch {
      // SVG animation not supported
    }
  })
}

/**
 * Triggers SVG animations and verifies they actually started by listening for beginEvent.
 * Returns a promise that resolves when at least one animation has confirmed it started.
 */
export function triggerSvgAnimationsWithVerification(svg: SVGSVGElement | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!svg) {
      resolve(false)
      return
    }

    const animations = svg.querySelectorAll('animate')
    if (animations.length === 0) {
      resolve(false)
      return
    }

    let resolved = false
    const cleanup: (() => void)[] = []

    const onBeginEvent = () => {
      if (resolved) return
      resolved = true
      // Clean up all listeners
      cleanup.forEach(fn => fn())
      resolve(true)
    }

    // Add beginEvent listeners to all animate elements
    animations.forEach((anim) => {
      anim.addEventListener('beginEvent', onBeginEvent)
      cleanup.push(() => anim.removeEventListener('beginEvent', onBeginEvent))
    })

    // Try to start the animations
    animations.forEach((anim) => {
      try {
        (anim as SVGAnimateElement).beginElement()
      } catch {
        // SVG animation not supported
      }
    })

    // Fallback: if beginEvent doesn't fire within 100ms, check if animation is running
    // by checking if getCurrentTime() returns a value (SVG is active)
    setTimeout(() => {
      if (resolved) return

      // Check if SVG has started playing by examining the document timeline
      // or if any animation's target attribute has changed
      const svgTime = svg.getCurrentTime()
      resolved = true
      cleanup.forEach(fn => fn())
      resolve(svgTime > 0)
    }, 100)
  })
}

/**
 * Attempts to trigger SVG animations with verification, retrying until successful.
 * Uses requestAnimationFrame for retries to sync with browser rendering.
 */
export function triggerSvgAnimationsUntilStarted(
  svg: SVGSVGElement | null,
  onStarted: () => void,
  maxAttempts: number = 20
): void {
  let attempts = 0

  const tryTrigger = async () => {
    attempts++

    if (!svg) {
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryTrigger)
      }
      return
    }

    const started = await triggerSvgAnimationsWithVerification(svg)

    if (started) {
      console.log(`[SVG] Animation verified started (attempt ${attempts})`)
      onStarted()
    } else if (attempts < maxAttempts) {
      // Retry on next frame
      requestAnimationFrame(tryTrigger)
    } else {
      // Max attempts reached, call onStarted anyway as fallback
      console.log(`[SVG] Animation fallback after ${attempts} attempts`)
      onStarted()
    }
  }

  tryTrigger()
}
