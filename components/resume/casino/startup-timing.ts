/** One-shot startup diagnostics visible in DevTools Performance > User Timing. */
export function startupStage(name: string): () => void {
  const start = performance.now()
  let done = false
  return () => {
    if (done) return
    done = true
    performance.measure(`casino:${name}`, { start, end: performance.now() })
  }
}
