/**
 * "A prop hit this character" (C2 → C1): the physics thread reports which character a ball or
 * a box arrived at, the character plays its `hit` reaction. A tiny event bus keyed by the
 * helper's place on the page (`${stop}:${index}`), so physics and characters stay apart.
 */
type Listener = () => void
const listeners = new Map<string, Set<Listener>>()

export const hitKey = (stop: number, helper: number) => `${stop}:${helper}`

export function onActorHit(key: string, fn: Listener): () => void {
  let set = listeners.get(key)
  if (!set) listeners.set(key, (set = new Set()))
  set.add(fn)
  return () => set.delete(fn)
}

export function emitActorHit(key: string) {
  listeners.get(key)?.forEach((fn) => fn())
}
