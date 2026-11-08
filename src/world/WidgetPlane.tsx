'use client'

import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WidgetSpec } from '@/experience/measure'
import { live, useExperience } from '@/experience/store'
import { isWidgetName, widgets } from '@/blocks/widgets/registry'
import { useTheme } from '@/theme/store'
import { ON_SURFACE } from './depthOffset'
import { timeline } from './timeline'
import { WidgetZoneContext, zoneOpacity } from './widgetZone'

/** Texture pixels per CSS pixel — sharp up close, small enough to redraw every frame. */
const TEXEL = 2

/**
 * A live widget on a 3D card: the widget's canvas drawing (same code as in 2D) as a texture
 * on a plane inside the card. It is part of the world — cards in front hide it, fog and the
 * ripple apply. It animates only while the camera is in its module (widgetZone.ts); outside
 * it keeps its last frame. Clicks map the hit point (uv) to widget pixels, and only after the
 * handover (before it the 2D page is on top, rule 18).
 *
 * `position` is the widget's centre in the card's local coordinates; `k` = world units per px.
 */
export function WidgetPlane({
  widget: spec,
  background,
  k,
  position,
}: {
  widget: WidgetSpec
  /** The card's colour (CSS). The widget is painted on it, so the plane is fully opaque. */
  background: string
  k: number
  position: [number, number, number]
}) {
  const widget = isWidgetName(spec.name) ? widgets[spec.name] : null
  const zoneCtx = useContext(WidgetZoneContext)
  const ui = useTheme().ui
  const w = spec.width
  const h = spec.height

  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * TEXEL)
    canvas.height = Math.round(h * TEXEL)
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { ctx, texture }
  }, [w, h])
  useEffect(() => () => texture.dispose(), [texture])

  // The widget's own state object (mutated in place by draw/click).
  const [state] = useState(() => widget?.init() ?? null)
  const drawn = useRef(false)
  // Opaque plane (painted on the card colour): no see-through pixels, so it can never punch a
  // hole in the card when it happens to be drawn before it. Only a see-through card keeps it
  // transparent.
  const opaque = !/rgba\(.*,\s*0(\.\d+)?\)$/.test(background)
  const hovered = useRef(false)

  useFrame(() => {
    if (!widget) return
    const inZone = zoneCtx ? zoneOpacity(timeline(live.progress, zoneCtx.timing.segments).railIndex, zoneCtx.zone) > 0 : true
    if (drawn.current && !inZone) return
    drawn.current = true
    ctx.setTransform(TEXEL, 0, 0, TEXEL, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (opaque) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, w, h)
    }
    widget.draw({ ctx, t: performance.now() / 1000, w, h, state, ui })
    texture.needsUpdate = true
  })

  if (!widget) return null

  const toWidget = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.uv ? [e.uv.x * w, (1 - e.uv.y) * h] : null)
  const live3d = () => useExperience.getState().handedOver

  return (
    <mesh
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const p = toWidget(e)
        if (!live3d() || !p || !widget.click) return
        if (widget.click(state, p[0]!, p[1]!, w, h, performance.now() / 1000)) e.stopPropagation()
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const p = toWidget(e)
        const over = live3d() && !!p && !!widget.hit?.(p[0]!, p[1]!, w, h)
        if (over === hovered.current) return
        hovered.current = over
        document.body.style.cursor = over ? 'pointer' : ''
      }}
      onPointerOut={() => {
        if (!hovered.current) return
        hovered.current = false
        document.body.style.cursor = ''
      }}
    >
      <planeGeometry args={[w * k, h * k]} />
      {/* Opaque, and ON_SURFACE: it lies 0.001 above the card — see depthOffset.ts. */}
      <meshBasicMaterial map={texture} transparent={!opaque} toneMapped={false} {...ON_SURFACE} />
    </mesh>
  )
}
