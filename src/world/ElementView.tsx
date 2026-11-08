'use client'

import { Text } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'
import type * as THREE from 'three'
import type { ElementSpec, TextStyle } from '@/experience/measure'
import { useExperience } from '@/experience/store'
import { isInternal } from '@/lib/href'
import { fontFor } from '@/theme/typography'
import { Slab } from './Slab'
import { useFrontTextMaterial } from './textMaterial'
import { WidgetPlane } from './WidgetPlane'
import { TEXT_DEPTH_OFFSET } from './depthOffset'

const DEPTH = 0.05

interface Props {
  spec: ElementSpec
  /** World units per CSS pixel. */
  k: number
  /** Called with a text's key (see `textKeys`) whenever its glyphs are ready. */
  onSync?: (key: string) => void
}

function Label({
  text,
  style,
  k,
  maxWidth,
  onSync,
  position,
  anchor,
  onSurface = false,
}: {
  text: string
  style: TextStyle
  k: number
  maxWidth?: number
  onSync?: () => void
  position: [number, number, number]
  anchor: 'top-left' | 'center'
  /**
   * Text lying on a card / button face. It writes no depth: the opaque card under it already
   * did, and the text's depth offset would read as a tiny step to the outline pass — the
   * cartoon styles then drew crease lines around every glyph ("doubled" text).
   */
  onSurface?: boolean
}) {
  const material = useFrontTextMaterial()
  material.depthWrite = !onSurface
  return (
    <Text
      material={material}
      // Text lies on card faces: win the depth test on low-precision (mobile) GPUs too.
      depthOffset={TEXT_DEPTH_OFFSET}
      font={fontFor(style.fontWeight)}
      fontSize={style.fontSize * k}
      letterSpacing={style.letterSpacing}
      lineHeight={style.lineHeight}
      color={style.color}
      maxWidth={maxWidth}
      textAlign={style.align}
      anchorX={anchor === 'center' ? 'center' : 'left'}
      anchorY={anchor === 'center' ? 'middle' : 'top'}
      position={position}
      onSync={onSync}
    >
      {text}
    </Text>
  )
}

/** Follow an element's 2D link from 3D: internal pages via the router (with the ripple), others natively. */
function follow(href: string) {
  const { navigate, ripple } = useExperience.getState()
  if (isInternal(href) && navigate) {
    ripple()
    navigate(href)
  } else {
    window.location.href = href
  }
}

/**
 * Makes an element do what its 2D original does when it is a link: click to follow, pointer
 * cursor, and a small lift on hover so it reads as alive. Only once the 3D world has taken over —
 * before that the DOM button sits exactly on top and handles the click itself.
 */
function Linked({ href, children }: { href?: string; children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const hovered = useRef(false)
  const lift = useRef(0)

  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = ''
    },
    [],
  )

  useFrame((_, delta) => {
    const g = group.current
    if (!g || !href) return
    lift.current += ((hovered.current ? 1 : 0) - lift.current) * (1 - Math.exp(-delta * 12))
    g.position.z = lift.current * 0.08
    g.scale.setScalar(1 + lift.current * 0.04)
  })

  if (!href) return <>{children}</>

  const live = () => useExperience.getState().handedOver
  return (
    <group
      ref={group}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!live()) return
        e.stopPropagation()
        follow(href)
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!live()) return
        e.stopPropagation()
        hovered.current = true
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (!hovered.current) return
        hovered.current = false
        document.body.style.cursor = ''
      }}
    >
      {children}
    </group>
  )
}

/** A measured 2D element rebuilt in 3D, centred on its origin. Same size, font and colours. */
export function ElementView({ spec, k, onSync }: Props) {
  const w = spec.width * k
  const h = spec.height * k
  // A pixel of slack so text wraps where the browser wrapped it, not one word earlier.
  const slack = 2 * k

  if (spec.kind === 'text') {
    return (
      <Linked href={spec.href}>
        <Label
          text={spec.text}
          style={spec.style}
          k={k}
          maxWidth={w + slack}
          onSync={onSync && (() => onSync(textKeys(spec)[0]!))}
          position={[-w / 2, h / 2, 0]}
          anchor="top-left"
        />
      </Linked>
    )
  }

  const box = spec.box!
  const border = box.borderColor ? k : 0
  // Slabs are OPAQUE: drawn in the opaque pass, always before the (transparent) text and the
  // widget plane on them. A transparent slab drawn after its text fails the depth test where
  // the text's empty glyph quads already wrote depth — holes in the card (seen on phones).
  // A see-through CSS background keeps the slab transparent.
  const seeThrough = /rgba\(.*,\s*0(\.\d+)?\)$/.test(box.background)
  const radius = Math.min(box.radius * k, h / 2, w / 2)
  return (
    <Linked href={spec.href}>
      {border > 0 && (
        // Border = a frame around the card slab (Slab inset), side by side with it — never a
        // slab behind it: overlapping faces fight for depth on phones (grey patches).
        <Slab width={w} height={h} radius={radius} depth={DEPTH} inset={border}>
          <meshBasicMaterial color={box.borderColor} />
        </Slab>
      )}
      <Slab width={w - border * 2} height={h - border * 2} radius={Math.max(radius - border, 0)} depth={DEPTH}>
        <meshBasicMaterial color={box.background} transparent={seeThrough} />
      </Slab>
      <group position-z={DEPTH / 2 + 0.002}>
        {spec.kind === 'button' ? (
          <Label
            text={spec.text}
            style={spec.style}
            k={k}
            onSync={onSync && (() => onSync(textKeys(spec)[0]!))}
            position={[0, 0, 0]}
            anchor="center"
            onSurface
          />
        ) : (
          spec.parts.map((part, i) => (
            <Label
              key={i}
              text={part.text}
              style={part.style}
              k={k}
              maxWidth={part.width * k + slack}
              onSync={onSync && (() => onSync(textKeys(spec)[i]!))}
              position={[-w / 2 + part.x * k, h / 2 - part.y * k, 0]}
              anchor="top-left"
              onSurface
            />
          ))
        )}
        {spec.widgets?.map((widget, i) => (
          <WidgetPlane
            key={i}
            widget={widget}
            background={box.background}
            k={k}
            position={[-w / 2 + (widget.x + widget.width / 2) * k, h / 2 - (widget.y + widget.height / 2) * k, -0.001]}
          />
        ))}
      </group>
    </Linked>
  )
}

/**
 * One key per text inside an element (its id, which text, and the text itself). Readiness is
 * tracked per key, not by counting: re-measuring builds new objects but unchanged texts do not
 * re-sync, so a counter reset on re-measure would never reach "all ready" again.
 */
export function textKeys(spec: ElementSpec): string[] {
  if (spec.kind === 'card') return spec.parts.map((p, i) => `${spec.id}#${i}:${p.text}`)
  return [`${spec.id}#0:${spec.text}`]
}
