'use client'

import { Canvas } from '@react-three/fiber'
import { ENTRANCE_GEOMETRY } from './layout'
import { useExperience } from '@/experience/store'
import { Atmosphere } from './Atmosphere'
import { Driver } from './Driver'
import { Effects } from './effects/Effects'
import { Floor } from './Floor'
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
      </Canvas>
      <div className={styles.overlay} ref={setHtmlPortal} />
    </div>
  )
}
