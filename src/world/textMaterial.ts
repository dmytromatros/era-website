'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Base material for 3D text (drei <Text material={…}>): single-sided, so text seen from behind
 * (e.g. through office glass) is hidden instead of showing up mirrored over what is in front.
 * Transparent so `fillOpacity` fades work. One per text: troika derives its own material from it.
 */
export function useFrontTextMaterial(): THREE.MeshBasicMaterial {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.FrontSide, transparent: true }), [])
  useEffect(() => () => material.dispose(), [material])
  return material
}
