'use client'

import { Canvas } from '@react-three/fiber'
import { ENTRANCE_GEOMETRY } from './layout'
import { useExperience } from '@/experience/store'
import { Atmosphere } from './Atmosphere'
import { Driver } from './Driver'
import { Effects } from './effects/Effects'
import { DebugStats } from './DebugStats'
import { Floor } from './Floor'
import { Metrics } from './Metrics'
import { QualityGovernor } from './QualityGovernor'
import { StylePrecompile } from './StylePrecompile'
import { XRay } from './XRay'
import { XRayPanel } from './XRayPanel'
import { setHtmlPortal } from './htmlPortal'
import { SceneContent } from './SceneContent'
import styles from './Scene.module.css'

/** The persistent 3D canvas. Mounted once per visit (lives in the locale layout). */
export function Scene() {
  const scene = useExperience((s) => s.scene)
  return (
    <div className={styles.canvas} aria-hidden>
      <Canvas
        flat // no tone mapping: colours match the CSS exactly, so the swap is invisible
        dpr={[1, 1.75]}
        camera={{
          fov: ENTRANCE_GEOMETRY.fov,
          position: ENTRANCE_GEOMETRY.cameraStart,
          near: 0.1,
          far: 140,
        }}
        gl={{ powerPreference: 'high-performance', antialias: false }}
        // Events come from the whole page, so the DOM can sit above the canvas.
        eventSource={document.body}
        eventPrefix="client"
      >
        {/* First: smooths scroll and decides the handover before anything else updates. */}
        <Driver />
        <Atmosphere />
        <Floor />
        {scene && <SceneContent key={scene.key} scene={scene} />}
        <Effects />
        {/* Quality levels + per-frame cost (docs/wow-plan.md, A1). */}
        <QualityGovernor />
        <Metrics />
        {/* Both looks compiled ahead, so the Comic ↔ Pastel switch does not hitch. */}
        <StylePrecompile />
        {/* X-ray mode: the world as a blueprint, one colour per draw call (B4). */}
        <XRay />
      </Canvas>
      <div className={styles.overlay} ref={setHtmlPortal} />
      <DebugStats />
      <XRayPanel />
    </div>
  )
}
