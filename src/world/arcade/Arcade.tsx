'use client'

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ArcadeTexts } from '@/content/schema'
import { useExperience } from '@/experience/store'
import { coffeeTalk } from '../coffee/coffeeModel'
import { cutsceneNow } from '../cutscene/cutsceneModel'
import { ON_SURFACE } from '../depthOffset'
import type { WorldLayout } from '../layout'
import type { ArcadeCabinet, Office } from '../officeModel'
import type { Timing } from '../route'
import { settleAnchors } from '../settleModel'
import { totalUnits } from '../timeline'
import { useQualitySettings } from '../quality'
import { ARCADE, flightClear, screenView } from './arcadeModel'
import { arcadeArrived, arcadeLeft, arcadeLink, enterArcade, leaveArcade, resetArcade, useArcade } from './arcadeState'
import type { ArcadeGame } from './games/types'
import { COLORS, drawAttract, drawBanner, drawDemo, makeCrt, SCREEN } from './screenDraw'

/** The game slot (E3): its own chunk, fetched when the pointer is over the screen or on the click. */
const loadGame = () => import('./games/comingSoon').then((m) => m.comingSoon as ArcadeGame<unknown>)
/** "Game over" stays on the screen this long after the office's player lost (s). */
const LOST_BANNER = 1.8

const frustum = new THREE.Frustum()
const projView = new THREE.Matrix4()
const sphere = new THREE.Sphere()

/**
 * The arcade machine's screen (E3): a small canvas shown as a texture in front of the cabinet
 * (rule 24), crisp pixels (nearest filtering). It is redrawn only in view and near (at the
 * quality level's rate; on `low` one still frame), so a machine nobody looks at costs one draw
 * call and nothing else. A click flies the camera into it (arcadeState.ts) — if the way there is
 * clear, else the screen says "come closer"; inside, the game slot runs (for now "coming soon").
 */
export function Arcade({
  cabinet,
  texts,
  accent,
  layout,
  office,
  timing,
}: {
  cabinet: ArcadeCabinet
  texts: ArcadeTexts
  accent: string
  layout: WorldLayout
  office: Office
  timing: Timing
}) {
  const { arcadeFps, arcadeGameFps } = useQualitySettings()
  const size = useThree((s) => s.size)
  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SCREEN.w
    canvas.height = SCREEN.h
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // Crisp pixels up close; mipmaps keep it calm from afar.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 4
    return { ctx, texture }
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const crt = useMemo(() => makeCrt(), [])
  const center = useMemo(() => new THREE.Vector3(...cabinet.screen.center), [cabinet])
  const touch = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches, [])
  // What stands in the way of a flight: furniture, columns, the exhibits (cards).
  const blockers = useMemo(
    () => [...office.footprints, ...layout.stations.map((st) => ({ x: st.anchor[0], z: st.anchor[2], r: 2.4 }))],
    [office, layout],
  )

  const s = useRef({
    game: null as ArcadeGame<unknown> | null,
    state: null as unknown,
    loading: null as Promise<ArcadeGame<unknown>> | null,
    /** Scene time the visitor clicked in, the last frame drawn, "come closer" shown. */
    enterAt: 0,
    drawnAt: -Infinity,
    drawn: false,
    closerAt: -Infinity,
    aspect: 0,
    /** Why the last click did (not) fly in (?debug=1). */
    why: '',
  })

  const fetchGame = () => {
    const st = s.current
    st.loading ??= loadGame().then((g) => (st.game = g))
    return st.loading
  }

  // Esc and Enter / Space while inside; the browser's Back flies out (the entry the arcade pushed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { phase } = useArcade.getState()
      if (phase === 'idle' || phase === 'leaving') return
      if (e.key === 'Escape') leaveArcade()
      else if ((e.key === 'Enter' || e.key === ' ') && phase === 'inside') {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return
        e.preventDefault()
        press(null)
      }
    }
    const onPop = () => leaveArcade(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      // Leaving the page (a portal, the menu): out of the machine, the scroll free again.
      resetArcade()
      arcadeLink.playing = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `press` reads only refs
  }, [])

  const now = () => sceneNow.current
  const sceneNow = useRef(0)

  // ?debug=1: where the screen is on the page (to click it from a test) and the arcade's state.
  const camera = useThree((st) => st.camera)
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return
    const w = window as unknown as { __eraArcade?: unknown }
    w.__eraArcade = {
      cabinet,
      state: () => ({ ...useArcade.getState(), playing: arcadeLink.playing, lostAt: arcadeLink.lostAt, step: s.current.state, why: s.current.why }),
      screen: () => {
        const p = center.clone().project(camera)
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, inFront: p.z < 1 }
      },
      /** Scroll to the stop that sees the machine best. */
      goTo: () => {
        const max = document.documentElement.scrollHeight - innerHeight
        scrollTo(0, (settleAnchors(timing)[cabinet.station]! / totalUnits(timing.segments)) * max)
      },
    }
    return () => void delete w.__eraArcade
  }, [cabinet, camera, center, timing])

  function press(at: { x: number; y: number } | null) {
    const st = s.current
    if (st.game && st.state) st.game.press(st.state, now() - st.enterAt, at)
  }

  function tryEnter(camera: THREE.Camera) {
    const x = useExperience.getState()
    const cutscene = cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done'
    if (x.portal.phase !== 'idle' || x.arrival || cutscene || coffeeTalk.on) {
      s.current.why = 'busy'
      return
    }
    const view = screenView(cabinet.screen, size.width / size.height)
    const from: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z]
    if (!flightClear(from, cabinet, view.eye, layout.architecture.walls, blockers)) {
      s.current.closerAt = now()
      s.current.why = 'blocked'
      return
    }
    s.current.why = 'in'
    const st = s.current
    st.enterAt = now()
    st.aspect = size.width / size.height
    void fetchGame().then((g) => {
      st.state = g.init()
    })
    enterArcade(view.eye, view.look)
  }

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime
    sceneNow.current = t
    const st = s.current
    const { phase, since } = useArcade.getState()
    const age = (performance.now() - since) / 1000
    if (phase === 'entering' && age >= ARCADE.enter) {
      arcadeArrived()
      // Through the glass of the screen: the ripple (B3's film effect) from its middle.
      useExperience.getState().ripple({ x: 0.5, y: 0.5 })
    } else if (phase === 'leaving' && age >= ARCADE.leave) arcadeLeft()
    // A resize inside: the screen must still fill the frame.
    const aspect = size.width / size.height
    if ((phase === 'entering' || phase === 'inside') && Math.abs(aspect - st.aspect) > 1e-3) {
      st.aspect = aspect
      const v = screenView(cabinet.screen, aspect)
      useArcade.setState({ eye: v.eye, look: v.look })
    }

    const inGame = phase === 'entering' || phase === 'inside'
    const banner = t - st.closerAt < ARCADE.closer || (arcadeLink.playing && t - arcadeLink.lostAt < LOST_BANNER)
    let fps: number
    if (inGame) fps = arcadeGameFps
    else {
      // Out of view or far: keep the last frame (no redraw, no texture upload).
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projView)
      sphere.set(center, 0.4)
      const near = camera.position.distanceTo(center) <= ARCADE.drawRange
      if (st.drawn && (!near || !frustum.intersectsSphere(sphere))) return
      // On `low` a still frame, redrawn only for a banner.
      fps = arcadeFps || (banner ? 4 : 0)
    }
    if (st.drawn && (fps === 0 || t - st.drawnAt < 1 / fps - 1e-4)) return
    st.drawn = true
    st.drawnAt = t

    if (inGame && st.game && st.state) {
      st.game.draw(st.state, { ctx, t: t - st.enterAt, texts, accent, touch })
    } else if (arcadeLink.playing && !inGame) {
      drawDemo(ctx, t)
      if (t - arcadeLink.lostAt < LOST_BANNER) drawBanner(ctx, texts.gameOver, t, COLORS.red)
    } else drawAttract(ctx, t, texts, accent)
    if (!inGame && t - st.closerAt < ARCADE.closer) drawBanner(ctx, texts.comeCloser, t, COLORS.cyan)
    ctx.drawImage(crt, 0, 0)
    texture.needsUpdate = true
  })

  const live3d = () => useExperience.getState().handedOver

  return (
    <mesh
      position={cabinet.screen.center}
      rotation={[0, cabinet.yaw, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!live3d()) return
        e.stopPropagation()
        const { phase } = useArcade.getState()
        if (phase === 'idle') tryEnter(e.camera)
        else if (phase === 'inside') press(e.uv ? { x: e.uv.x * SCREEN.w, y: (1 - e.uv.y) * SCREEN.h } : null)
      }}
      onPointerOver={() => {
        if (!live3d()) return
        void fetchGame()
        if (useArcade.getState().phase === 'idle' || useArcade.getState().phase === 'inside') document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <planeGeometry args={cabinet.screen.size} />
      {/* Unlit (it glows), opaque; ON_SURFACE: it lies 2 cm in front of the housing (rule 25). */}
      <meshBasicMaterial map={texture} toneMapped={false} {...ON_SURFACE} />
    </mesh>
  )
}
