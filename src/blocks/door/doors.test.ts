import { describe, expect, it } from 'vitest'
import { sceneKeyOf } from '@/experience/portal'
import { hashKey, officeStyle } from '@/world/officeStyle'
import { doorOffsets, hrefOfSceneKey, portalDoors } from './doors'

const nav = [
  { label: 'Home', href: '/' },
  { label: 'Who we are', href: '/who-we-are' },
  { label: 'Contacts', href: '/contacts' },
]

describe('portal hall doors', () => {
  it('puts the module door first, then every other page, never the current one', () => {
    expect(portalDoors({ label: 'Who we are', href: '/who-we-are' }, nav, '/')).toEqual([
      { label: 'Who we are', href: '/who-we-are', primary: true },
      { label: 'Contacts', href: '/contacts', primary: false },
    ])
  })

  it('does not duplicate a page that is both the door and in the nav', () => {
    const doors = portalDoors({ label: 'Back to the start', href: '/' }, nav, '/contacts')
    expect(doors.map((d) => d.href)).toEqual(['/', '/who-we-are'])
    expect(doors[0]!.label).toBe('Back to the start')
  })

  it('drops the module door if it points at the current page', () => {
    expect(portalDoors({ label: 'Here', href: '/contacts/' }, nav, '/contacts').every((d) => !d.primary)).toBe(true)
  })

  it('centres the primary door and alternates the others', () => {
    expect(doorOffsets(1)).toEqual([0])
    const [a, b, c] = doorOffsets(3)
    expect(a).toBe(0)
    expect(b).toBeGreaterThan(0)
    expect(c).toBeCloseTo(-b!)
  })
})

describe('page keys', () => {
  it('turns pathnames and scene keys into each other', () => {
    expect(sceneKeyOf('/en')).toBe('en/')
    expect(sceneKeyOf('/en/contacts')).toBe('en/contacts')
    expect(hrefOfSceneKey('en/')).toBe('/')
    expect(hrefOfSceneKey('en/who-we-are')).toBe('/who-we-are')
  })
})

describe('office style per page', () => {
  it('differs between pages and is stable for a page', () => {
    expect(officeStyle('en/', {})).toEqual(officeStyle('en/', {}))
    expect(officeStyle('en/', {}).seed).not.toBe(officeStyle('en/contacts', {}).seed)
    expect(hashKey('a')).not.toBe(hashKey('b'))
  })

  it('lets content pin the seed and accent', () => {
    expect(officeStyle('en/', { office: { seed: 7, accent: '#123456' } })).toEqual({ seed: 7, accent: '#123456' })
  })
})
