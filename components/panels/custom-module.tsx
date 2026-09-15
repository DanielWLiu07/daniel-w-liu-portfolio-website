'use client'

import { Component, Suspense, lazy, type ReactNode } from 'react'
import { TOOL_MODULES } from './tool-modules'

const components = new Map(TOOL_MODULES.filter(module => module.load)
  .map(module => {
    const LoadedModule = lazy(module.load!)
    return [module.id, <LoadedModule key={module.id} />] as const
  }))

class ModuleBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    return this.state.error ? <p className="p-4">This module could not load. Close it and reopen to retry.</p> : this.props.children
  }
}

export default function CustomModule({ id }: { id: string }) {
  const content = components.get(id)
  if (!content) return <p className="p-4">Module is not registered.</p>
  return <ModuleBoundary><Suspense fallback={<p className="p-4">Loading module…</p>}>{content}</Suspense></ModuleBoundary>
}
