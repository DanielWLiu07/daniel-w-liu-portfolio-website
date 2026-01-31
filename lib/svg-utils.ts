export function triggerSvgAnimations(svg: SVGSVGElement | null): boolean {
  if (!svg) return false
  const animations = svg.querySelectorAll('animate')
  if (animations.length === 0) return false

  let triggered = false
  animations.forEach((anim) => {
    try {
      (anim as SVGAnimateElement).beginElement()
      triggered = true
    } catch {
      // SVG animation not supported
    }
  })
  return triggered
}
