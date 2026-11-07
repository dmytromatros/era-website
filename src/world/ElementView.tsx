'use client'

import { Text } from '@react-three/drei'
import type { ElementSpec, TextStyle } from '@/experience/measure'
import { fontFor } from '@/theme/typography'
import { Slab } from './Slab'

const DEPTH = 0.05

interface Props {
  spec: ElementSpec
  /** World units per CSS pixel. */
  k: number
  /** Called when a text's glyphs are ready (once per text inside the element). */
  onSync?: () => void
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
  return (
    <Text
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

/** A measured 2D element rebuilt in 3D, centred on its origin. Same size, font and colours. */
export function ElementView({ spec, k, onSync }: Props) {
  const w = spec.width * k
  const h = spec.height * k
  // A pixel of slack so text wraps where the browser wrapped it, not one word earlier.
  const slack = 2 * k

  if (spec.kind === 'text') {
    return (
      <Label
        text={spec.text}
        style={spec.style}
        k={k}
        maxWidth={w + slack}
        onSync={onSync}
        position={[-w / 2, h / 2, 0]}
        anchor="top-left"
      />
    )
  }

  const box = spec.box!
  const border = box.borderColor ? k : 0
  const radius = Math.min(box.radius * k, h / 2, w / 2)
  return (
    <group>
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
          <Label text={spec.text} style={spec.style} k={k} onSync={onSync} position={[0, 0, 0]} anchor="center" />
        ) : (
          spec.parts.map((part, i) => (
            <Label
              key={i}
              text={part.text}
              style={part.style}
              k={k}
              maxWidth={part.width * k + slack}
              onSync={onSync}
              position={[-w / 2 + part.x * k, h / 2 - part.y * k, 0]}
              anchor="top-left"
            />
          ))
        )}
      </group>
    </group>
  )
}

/** How many texts an element contains — to know when all of them are ready. */
export function textCount(spec: ElementSpec): number {
  return spec.kind === 'card' ? spec.parts.length : 1
}
