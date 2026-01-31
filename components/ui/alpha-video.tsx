'use client'

import { forwardRef, useState, useEffect } from 'react'

interface AlphaVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  /** Base path without extension, e.g., "/landing/videos/tree_right" */
  src: string
  /** Optional query string to append (e.g., "?v=2" for cache busting) */
  query?: string
  /** Fallback image to show if video fails to load */
  fallbackImage?: string
}

/**
 * Video component that supports alpha transparency across browsers.
 * - Chrome/Firefox/Edge: Uses VP9 WebM with alpha transparency
 * - Safari: Uses HEVC with alpha in MOV container
 *
 * Always renders a video element to preserve DOM consistency for animations.
 */
export const AlphaVideo = forwardRef<HTMLVideoElement, AlphaVideoProps>(
  function AlphaVideo({ src, query = '', fallbackImage, className, ...props }, ref) {
    const [isSafari, setIsSafari] = useState(false)
    const [browserDetected, setBrowserDetected] = useState(false)

    useEffect(() => {
      // Detect Safari
      const ua = navigator.userAgent
      const safari = /^((?!chrome|android).)*safari/i.test(ua)
      setIsSafari(safari)
      setBrowserDetected(true)
    }, [])

    const webmSrc = `${src}.webm${query}`
    const hevcSrc = `${src}_hevc.mov${query}`

    // Always render video element to preserve DOM for GSAP animations
    // Use poster for fallback image, and only set source after browser detection
    return (
      <video
        ref={ref}
        className={className}
        poster={fallbackImage}
        {...props}
      >
        {browserDetected && (
          isSafari ? (
            <source src={hevcSrc} type='video/quicktime; codecs="hvc1"' />
          ) : (
            <source src={webmSrc} type="video/webm" />
          )
        )}
      </video>
    )
  }
)
