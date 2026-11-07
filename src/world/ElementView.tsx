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
}: {
  text: string
  style: TextStyle
  k: number
  maxWidth?: number
  onSync?: () => void
  position: [number, number, number]
  anchor: 'top-left' | 'center'
}) {
  const material = useFrontTextMaterial()
  return (
    <Text
      material={material}
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
  const radius = Math.min(box.radius * k, h / 2, w / 2)
  return (
    <Linked href={spec.href}>
      {border > 0 && (
        <group position-z={-0.002}>
          <Slab width={w} height={h} radius={radius} depth={DEPTH * 0.9}>
            <meshBasicMaterial color={box.borderColor} transparent />
          </Slab>
        </group>
      )}
      <Slab width={w - border * 2} height={h - border * 2} radius={Math.max(radius - border, 0)} depth={DEPTH}>
        <meshBasicMaterial color={box.background} transparent />
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
            />
          ))
        )}
        {spec.widgets?.map((widget, i) => (
          <WidgetPlane
            key={i}
            widget={widget}
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
