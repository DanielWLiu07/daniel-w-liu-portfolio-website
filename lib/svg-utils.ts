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
