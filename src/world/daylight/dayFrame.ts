import * as THREE from 'three'

/**
 * This frame's time of day (E6), shared by the materials that are not lights: set once a frame
 * by <Atmosphere> (mounted before everything that reads it), read by <Office> (windows, ceiling
 * lamps) and <Floor>. Each blends from its OWN base colour towards the look's colour by `mix`,
 * so with mix 0 (the top of the page, the dark theme, the switch off) nothing differs at all.
 * `version` changes only when something did — readers repaint only then.
 */
export const dayFrame = {
  mix: 0,
  window: new THREE.Color(),
  lamp: new THREE.Color(),
  floor: new THREE.Color('#ffffff'),
  version: 0,
}

/** `target` = `base` blended to the look's `to` by the frame's mix. */
export function dayColor(target: THREE.Color, base: THREE.ColorRepresentation, to: THREE.Color): THREE.Color {
  return target.set(base).lerp(to, dayFrame.mix)
}
