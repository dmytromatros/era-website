/**
 * Named things a 3D copy of an element can do when clicked, besides following a link (E9: the
 * letter card opens the sheet). The 2D element names it (`data-action="letter"`), measure.ts
 * records it, and whoever owns the behaviour registers a handler. No handler: the click does
 * nothing (and the element shows no pointer).
 */
const handlers = new Map<string, () => void>()

/** Register what `name` does; returns the unregister. */
export function onElementAction(name: string, run: () => void): () => void {
  handlers.set(name, run)
  return () => {
    if (handlers.get(name) === run) handlers.delete(name)
  }
}

export const hasElementAction = (name: string) => handlers.has(name)

export function runElementAction(name: string): boolean {
  const run = handlers.get(name)
  run?.()
  return !!run
}

/**
 * The 3D copy of the element that carries an action (E9: the camera flies up to the letter card,
 * the sheet peels off it). Registered by the 3D view; typed loosely to keep three.js out of 2D.
 */
const targets = new Map<string, unknown>()

export function registerActionTarget(name: string, object: unknown): () => void {
  targets.set(name, object)
  return () => {
    if (targets.get(name) === object) targets.delete(name)
  }
}

export const actionTarget = <T>(name: string) => targets.get(name) as T | undefined
