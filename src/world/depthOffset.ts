/**
 * Things lying ON a card's face (3D text, widget textures) sit only ~0.001–0.002 in front of
 * it. Mobile GPUs have less depth precision; at a distance or at an angle the card then
 * wins the depth test and the text / widget disappears in patches ("transparent until the
 * camera turns to it"). polygonOffset pulls these surfaces towards the camera in depth-buffer
 * units, so they win regardless of precision. Factor handles slanted views, units the rest.
 * Reproduce: set the camera `near` to 0.0005 in Scene.tsx and look down the steps corridor.
 */
export const ON_SURFACE = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -4,
} as const

/**
 * The same for 3D text. troika ignores the base material's polygonOffset and sets it from its
 * own `depthOffset` prop (factor = units = depthOffset), so text passes this instead.
 */
export const TEXT_DEPTH_OFFSET = -4
