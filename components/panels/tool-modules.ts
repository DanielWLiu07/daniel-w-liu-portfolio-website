/** Add a module here; schema tools use the existing host, custom tools own their UI. */
export interface ToolModule {
  id: string
  title: string
  description: string
  kind: 'panel' | 'custom'
  load?: () => Promise<{ default: import('react').ComponentType }>
}

export const TOOL_MODULES: readonly ToolModule[] = [
  { id: 'casino-title-eyes', title: 'Colored eyes', description: 'Place the eyes beside the Always bet title in /resume/eyes.', kind: 'panel' },
  { id: 'casino-roulette', title: 'Roulette', description: 'Place and animate the roulette wheel.', kind: 'panel' },
  { id: 'casino-royal-flush', title: 'Royal flush', description: 'Configure the flying cards.', kind: 'panel' },
  { id: 'casino-flight', title: 'Chip & camera', description: 'Tune the chip flight and camera.', kind: 'panel' },
  { id: 'casino-background', title: 'Background', description: 'Compare and animate the intro and flight backdrops.', kind: 'panel' },
  { id: 'casino-dealer', title: 'Character layout', description: 'Size, position and rotate the skeleton.', kind: 'panel' },
  { id: 'cartoon-face', title: 'Cartoon face', description: 'Pose the sockets and jaw, shape the skull, and animate expressions.', kind: 'custom',
    load: () => import('@/components/resume/face/face-module') },
  { id: 'motion-capture', title: 'Webcam motion', description: 'Perform, record and export character animation.', kind: 'custom',
    load: () => import('@/components/resume/motion/motion-module') },
]

export function toolModule(id: string) { return TOOL_MODULES.find(module => module.id === id) }
