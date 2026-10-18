import { hashHex } from './hash'
import { fold } from '../shared/text'
import type { Engine } from '../shared/types'

/** Stable id for a work + engine, so rebuilding the same story overwrites it. */
export function storyId(title: string, identity: string, engine: Engine): string {
  const slug =
    fold(title)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'story'
  return `${slug}-${hashHex(`${identity}|${engine}`).slice(0, 8)}`
}

export function queryKey(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export const safeId = (id: string): string => id.replace(/[^a-z0-9-]/gi, '')
