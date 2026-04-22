'use client'

import { forwardRef, useState } from 'react'

interface AlphaVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  /** Base path without extension, e.g., "/landing/videos/tree_right" */
  src: string
  /** Optional query string to append (e.g., "?v=2" for cache busting) */
  query?: string
  /** Fallback image to show if video fails to load */
  fallbackImage?: string
}

// Detect Safari synchronously at module load time so <source> is present
// on the very first render. Inserting <source> after mount requires calling
// video.load(), which interrupts any pending autoplay promise with AbortError.
function detectSafariSync(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /^((?!chrome|android).)*safari/i.test(ua)
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
    // Detect browser synchronously at mount to avoid a post-mount <source>
    // insertion. On server (SSR) this returns false which renders a
    // webm <source> — harmless because the video doesn't play on server.
    const [isSafari] = useState(detectSafariSync)

    const webmSrc = `${src}.webm${query}`
    const hevcSrc = `${src}_hevc.mov${query}`

    return (
      <video
        ref={ref}
        className={className}
        poster={fallbackImage}
        {...props}
      >
        {isSafari ? (
          <source src={hevcSrc} type='video/quicktime; codecs="hvc1"' />
        ) : (
          <source src={webmSrc} type="video/webm" />
        )}
      </video>
    )
  }
)
