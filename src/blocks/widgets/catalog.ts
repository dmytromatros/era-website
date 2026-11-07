/**
 * Live widgets a module can carry (simplified look-alikes of dfrnc.netlify.app animations).
 * Pure list — used by the content schema. Drawings are in ./registry.ts; how they are shown
 * in 2D and 3D is explained in ./canvas.ts.
 */
export const WIDGETS = ['chat', 'toggles', 'mockup', 'delivery'] as const
export type WidgetName = (typeof WIDGETS)[number]
