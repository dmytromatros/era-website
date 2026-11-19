'use client'

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MonitorTexts } from '@/content/schema'
import { useExperience } from '@/experience/store'
import { useTheme } from '@/theme/store'
import { useArcade } from '../arcade/arcadeState'
import { flightClear } from '../arcade/arcadeModel'
import { coffeeTalk } from '../coffee/coffeeModel'
import { cutsceneNow } from '../cutscene/cutsceneModel'
import { photoBusy } from '../photo/photoState'
import { letterBusy } from '@/experience/letter/letterState'
import { ON_SURFACE } from '../depthOffset'
import type { WorldLayout } from '../layout'
import type { MonitorDesk, Office } from '../officeModel'
import type { Timing } from '../route'
import { settleAnchors } from '../settleModel'
import { totalUnits } from '../timeline'
import { useQualitySettings } from '../quality'
import { paintCloser, paintLanding, type Area } from './landingPicture'
import { MONITOR, monitorView, pageRect } from './monitorModel'
import { cancelMonitor, enterMonitor, monitorArrived, monitorLeft, resetMonitor, useMonitor } from './monitorState'

/**
 * The monitor's screen (E5): a canvas texture in front of the bezel (rule 24) with a picture of
 * the 2D landing (landingPicture.ts) — painted once when the monitor appears, again only when the
 * page, the theme or the size change. Nothing a frame: a monitor nobody looks at costs one draw
 * call. A click flies the camera into it (monitorState.ts) — if the way there is clear, else the
 * screen says "come closer"; at the screen the visitor is back at the top of the 2D page.
 */
export function Monitor({
  desk,
  texts,
  layout,
  office,
  timing,
}: {
  desk: MonitorDesk
  texts: MonitorTexts
  layout: WorldLayout
  office: Office
  timing: Timing
}) {
  const { monitorScreen } = useQualitySettings()
  const size = useThree((s) => s.size)
  const { ui } = useTheme()
  const measured = useExperience((s) => s.elements)
  const aspect = size.width / size.height
  const [sw, sh] = desk.screen.size

  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.height = monitorScreen
    canvas.width = Math.round((monitorScreen * sw) / sh)
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 4
    return { ctx, texture }
  }, [monitorScreen, sw, sh])
  useEffect(() => () => texture.dispose(), [texture])

  // Where the page lies on the canvas: the window the camera sees at the end of the flight.
  const area = useMemo((): Area => {
    const r = pageRect(desk.screen.size, aspect)
    const { width, height } = ctx.canvas
    return { x: r.x * width, y: r.y * height, w: r.w * width, h: r.h * height }
  }, [desk, aspect, ctx])

  const s = useRef({ closerAt: -Infinity, closerTimer: 0, why: '', aspect: 0 })

  // Paint the landing: a little after the monitor appears (never in the handover's frame), and
  // again when the page is re-measured (theme, fonts, resize).
  useEffect(() => {
    let alive = true
    const paint = () =>
      void paintLanding(ctx, area, { bg: ui.bg, dot: ui.dot }).then(() => {
        if (!alive) return
        if (performance.now() - s.current.closerAt < MONITOR.closer * 1000) paintCloser(ctx, area, texts.comeCloser, ui)
        texture.needsUpdate = true
      })
    const timer = window.setTimeout(paint, MONITOR.drawDelay)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [ctx, area, ui, measured, texture, texts.comeCloser])

  // What stands in the way of a flight: furniture, columns, the exhibits (cards).
  const blockers = useMemo(
    // (Not the exhibits it stands between: the stop that sees it and the portal hall.)
    () => [
      ...office.footprints,
      ...layout.stations.flatMap((st, i) => (i === desk.station || i === desk.hall ? [] : [{ x: st.anchor[0], z: st.anchor[2], r: 2.4 }])),
    ],
    [office, layout, desk.station, desk.hall],
  )

  // Esc turns a flight round; leaving the page (a portal, the menu) ends it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelMonitor()
    }
    window.addEventListener('keydown', onKey)
    const closer = s.current
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(closer.closerTimer)
      resetMonitor()
    }
  }, [])

  // ?debug=1: where the screen is on the page (to click it from a test) and the flight's state.
  const camera = useThree((st) => st.camera)
  const center = useMemo(() => new THREE.Vector3(...desk.screen.center), [desk])
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return
    const w = window as unknown as { __eraMonitor?: unknown }
    w.__eraMonitor = {
      desk,
      state: () => ({ ...useMonitor.getState(), why: s.current.why }),
      /** The picture on the screen (PNG data URL) and where the page lies on it (canvas px). */
      picture: () => ({ png: ctx.canvas.toDataURL('image/png'), area }),
      screen: () => {
        const p = center.clone().project(camera)
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, inFront: p.z < 1 }
      },
      /** Scroll to the stop that sees the monitor best. */
      goTo: () => {
        const max = document.documentElement.scrollHeight - innerHeight
        scrollTo(0, (settleAnchors(timing)[desk.station]! / totalUnits(timing.segments)) * max)
      },
    }
    return () => void delete w.__eraMonitor
  }, [desk, camera, center, timing, ctx, area])

  function tryEnter(cam: THREE.Camera) {
    const x = useExperience.getState()
    const cutscene = cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done'
    if (x.portal.phase !== 'idle' || x.arrival || cutscene || coffeeTalk.on || useArcade.getState().phase !== 'idle' || photoBusy() || letterBusy()) {
      s.current.why = 'busy'
      return
    }
    const view = monitorView(desk.screen, aspect)
    const from: [number, number, number] = [cam.position.x, cam.position.y, cam.position.z]
    if (!flightClear(from, desk, view.eye, layout.architecture.walls, blockers, MONITOR.reach)) {
      s.current.why = 'blocked'
      showCloser()
      return
    }
    s.current.why = 'in'
    s.current.aspect = aspect
    enterMonitor(view.eye, view.look)
  }

  // "Come closer" on the screen for a moment: two repaints (a texture upload each), nothing between.
  function showCloser() {
    const st = s.current
    const fresh = performance.now() - st.closerAt >= MONITOR.closer * 1000
    st.closerAt = performance.now()
    window.clearTimeout(st.closerTimer)
    if (fresh) {
      paintCloser(ctx, area, texts.comeCloser, ui)
      texture.needsUpdate = true
    }
    st.closerTimer = window.setTimeout(() => {
      void paintLanding(ctx, area, { bg: ui.bg, dot: ui.dot }).then(() => (texture.needsUpdate = true))
    }, MONITOR.closer * 1000)
  }

  useFrame(() => {
    const { phase, since } = useMonitor.getState()
    if (phase === 'idle') return
    const age = (performance.now() - since) / 1000
    // The camera reached the screen this frame (CameraRig ran before this): back to the top of the page.
    if (phase === 'entering' && age >= MONITOR.enter) monitorArrived()
    else if (phase === 'leaving' && age >= MONITOR.leave) monitorLeft()
    else if (phase === 'entering' && Math.abs(aspect - s.current.aspect) > 1e-3) {
      // A resize mid-flight: the screen must still cover the frame.
      s.current.aspect = aspect
      useMonitor.setState({ eye: monitorView(desk.screen, aspect).eye })
    }
  })

  const live3d = () => useExperience.getState().handedOver

  return (
    <mesh
      position={desk.screen.center}
      rotation={[0, desk.yaw, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!live3d()) return
        e.stopPropagation()
        if (useMonitor.getState().phase === 'idle') tryEnter(e.camera)
      }}
      onPointerOver={() => {
        if (live3d() && useMonitor.getState().phase === 'idle') document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <planeGeometry args={desk.screen.size} />
      {/* Unlit (it glows), opaque; ON_SURFACE: it lies 2 cm in front of the bezel (rule 25). The
          same material as the arcade's screen and the cards' widgets: no new shader program. */}
      <meshBasicMaterial map={texture} toneMapped={false} {...ON_SURFACE} />
    </mesh>
  )
}
