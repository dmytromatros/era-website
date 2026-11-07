/**
 * 2D views of every module type. Adding a type without a 2D view is a type error.
 * (Kept apart from 3D code so the flat page never downloads three.js.)
 */
import { Cards2D } from './cards/Cards2D'
import { Cta2D } from './cta/Cta2D'
import { Door2D } from './door/Door2D'
import { Hero2D } from './hero/Hero2D'
import { Steps2D } from './steps/Steps2D'
import type { Registry2D } from './types'

export const registry2d: Registry2D = {
  hero: Hero2D,
  cards: Cards2D,
  steps: Steps2D,
  cta: Cta2D,
  door: Door2D,
}
