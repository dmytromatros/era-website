import type { ComponentType } from 'react'
import type { ActorDef, Block, BlockType, DoorBlock } from '@/content/schema'
import type { StationLayout } from '@/world/layout'

export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>

export interface Block2DProps<B extends Block = Block> {
  block: B
  /** Position of the module on the page — written to `data-block` so 3D can find its elements. */
  index: number
  locale: string
  actors: Record<string, ActorDef>
}

/**
 * Every module needs a 2D view. Elements inside it carry `data-el="<id>"` (ids from
 * elements.ts) and `data-kind="text|button|card"`; the 3D world is built from them.
 */
export type Registry2D = { [T in BlockType]: ComponentType<Block2DProps<BlockOf<T>>> }

/** Props of blocks that have their own 3D look instead of the generic one (doors). */
export interface Custom3DProps {
  block: DoorBlock
  locale: string
  station: StationLayout
  index: number
  stops: StopInfo[]
}

/** Per-stop timing info, needed to know when the camera is at a given stop. */
export interface StopInfo {
  key: boolean
}
