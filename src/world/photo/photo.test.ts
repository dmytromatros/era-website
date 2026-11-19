import { describe, expect, it } from 'vitest'
import { PHOTO_MOVES, REACTIONS } from '@/actors/catalog'
import { reactions, reactionWeight } from '@/actors/reactions'
import { readActor } from '@/content/read'
import { readPage } from '@/content/read'
import { layoutRoute } from '../layout'
import { buildOffice } from '../officeModel'
import { routePlan } from '../route'
import { buildNavGrid } from '../crowd/navGrid'
import { crowdSpots, isPhotoPose, newCrowd, photoPose, reactTime, walkHalt, walkTime } from '../crowd/crowdModel'
import { lookAtGuest, poseOf, turnToCamera } from '../crowd/crowdPose'
import { pageLabel, PHOTO, PHOTO_EMOJI_DELAY, PHOTO_END, PHOTO_TURN, photoAt, photoTurn, turnBetween, photoCue, photoFileName, photoPoseFor, photoSize, polaroidLayout, SHUTTER, takesCue } from './photoModel'
import { heldAt, PHONE, phonePose } from './phoneModel'

describe('the photo moment (E7)', () => {
  it('raises the phone, counts 3-2-1, then the shutter, then the phone goes down', () => {
    expect(photoAt(0).up).toBe(0)
    expect(photoAt(0).posing).toBe(false)
    expect(photoAt(PHOTO.raise).up).toBeGreaterThan(0.95)
    const counts = [0.1, 0.45, 0.8].map((f) => photoAt(PHOTO.raise + PHOTO.tick * (f * PHOTO.count)).count)
    expect(counts).toEqual([3, 2, 1])
    expect(photoAt(SHUTTER - 0.01).shutter).toBe(false)
    expect(photoAt(SHUTTER).shutter).toBe(true)
    expect(photoAt(SHUTTER).count).toBe(0)
    expect(photoAt(SHUTTER + PHOTO.jolt / 2).jolt).toBeGreaterThan(0.9)
    expect(photoAt(PHOTO_END).done).toBe(true)
    expect(photoAt(PHOTO_END).up).toBe(0)
    // The scroll is held for the countdown only: about two seconds.
    expect(SHUTTER).toBeGreaterThan(1.8)
    expect(SHUTTER).toBeLessThan(2.6)
  })

  it('everyone is in full pose when the shutter clicks (poses are cued as the countdown starts)', () => {
    const atShutter = SHUTTER - PHOTO.raise
    // Characters (C1 reactions)…
    for (const move of PHOTO_MOVES) {
      expect(reactions[move].duration).toBe(PHOTO.pose)
      expect(reactionWeight(move, atShutter).w).toBe(1)
      // …and already well into it by the last number.
      expect(reactionWeight(move, atShutter - PHOTO.tick).w).toBeGreaterThan(0.95)
    }
    // …and the crowd: its blend is in by 0.15 s, out over the last 0.3 s.
    expect(reactTime('peace')).toBe(PHOTO.pose)
    // The character's emoji is in the air, full size, at the shutter (lifeModel: full 0.25 → 1.125 s).
    expect(atShutter - PHOTO_EMOJI_DELAY).toBeGreaterThan(0.25)
    expect(atShutter - PHOTO_EMOJI_DELAY).toBeLessThan(1.1)
    expect(atShutter).toBeGreaterThan(0.15)
    expect(atShutter).toBeLessThan(PHOTO.pose - 0.3)
  })

  it('a character poses its own way, or one of the photo poses by its id (the same every time)', () => {
    const bohdan = readActor('bohdan')
    expect(photoPoseFor(bohdan)).toEqual(bohdan.pose)
    const ada = readActor('ada')
    expect(ada.pose).toBeUndefined()
    const a = photoPoseFor(ada)
    expect(PHOTO_MOVES).toContain(a.move)
    expect(photoPoseFor(ada)).toEqual(a)
    for (const m of PHOTO_MOVES) expect(REACTIONS).toContain(m)
  })

  it('a cue is taken once, and only right away (someone coming into view later does not pose)', () => {
    photoCue.id = 5
    photoCue.at = 10
    expect(takesCue(4, 10.1)).toBe(true)
    expect(takesCue(5, 10.1)).toBe(false)
    expect(takesCue(4, 10 + PHOTO.cueWindow + 0.01)).toBe(false)
    expect(takesCue(4, 9.9)).toBe(false)
    photoCue.id = 0
    photoCue.at = -Infinity
    expect(takesCue(0, 0)).toBe(false)
  })
})

describe('the phone in the hand (E7)', () => {
  for (const [name, aspect] of [
    ['wide', 16 / 10],
    ['portrait', 9 / 19.5],
  ] as const) {
    const view = { aspect, fov: 50 }
    const half = (z: number) => Math.tan((25 * Math.PI) / 180) * -z
    it(`held up, the whole phone is in the frame, in its lower right (${name})`, () => {
      const [x, y, z] = heldAt(view)
      const h = half(z)
      expect(x + PHONE.width / 2 + 0.03).toBeLessThan(h * aspect)
      expect(x - PHONE.width / 2).toBeGreaterThan(-h * aspect)
      expect(x).toBeGreaterThan(0)
      expect(y + PHONE.height / 2).toBeLessThan(0.1 * h)
      expect(y - PHONE.height / 2).toBeGreaterThan(-h)
    })
    it(`down, it is out of the frame (${name})`, () => {
      const p = phonePose(0, 0, view).position
      expect(p[1] + PHONE.height).toBeLessThan(-half(p[2]))
    })
  }

  it('the thumb sits on the bezel, never over the screen (the screen is a hole: it would be cut)', () => {
    // Photo.tsx: thumb 16 mm wide, turned 0.2 rad, centred 70 mm right of the phone's centre.
    const halfWidth = 0.008 * Math.cos(0.2) + 0.02 * Math.sin(0.2)
    expect(0.07 - halfWidth).toBeGreaterThanOrEqual(PHONE.screen.x1)
    expect(0.07 + halfWidth).toBeLessThan(PHONE.width / 2 + 0.012)
  })
})

describe('the polaroid (E7)', () => {
  it('frames the picture with an even border and a strip below, inside the card', () => {
    for (const [w, h] of [
      [1800, 1125],
      [830, 1800],
    ] as const) {
      const L = polaroidLayout(w, h)
      expect(L.photo.x).toBe(L.photo.y)
      expect(L.width).toBe(w + 2 * L.photo.x)
      expect(L.strip.y).toBe(L.photo.y + h)
      expect(L.strip.y + L.strip.h).toBe(L.height)
      expect(L.strip.h).toBeGreaterThan(L.photo.x * 2)
    }
  })
  it('the picture keeps its proportions, at most PHOTO.maxSide', () => {
    expect(photoSize(2240, 1400)).toEqual({ w: 1800, h: 1125 })
    expect(photoSize(900, 600)).toEqual({ w: 900, h: 600 })
    const tall = photoSize(1000, 2200)
    expect(tall.h).toBe(1800)
    expect(Math.abs(tall.w / tall.h - 1000 / 2200)).toBeLessThan(0.002)
  })
  it("the page's own name, without the site's", () => {
    expect(pageLabel('DFRNC', 'DFRNC — Web motion design')).toBe('Web motion design')
    expect(pageLabel('DFRNC', 'Who we are | DFRNC')).toBe('Who we are')
    expect(pageLabel('DFRNC', 'Contacts')).toBe('Contacts')
    expect(pageLabel('DFRNC', 'DFRNC')).toBe('DFRNC')
  })
  it('the file is named after the site, the page and the day', () => {
    expect(photoFileName('DFRNC', 'DFRNC — Web motion design', new Date(2026, 10, 19))).toBe('dfrnc-office-web-motion-design-2026-11-19.png')
    expect(photoFileName('DFRNC', 'Who we are', new Date(2026, 10, 19))).toBe('dfrnc-office-who-we-are-2026-11-19.png')
    expect(photoFileName('DFRNC', '', new Date(2026, 0, 2))).toBe('dfrnc-office-2026-01-02.png')
  })
})

describe('the crowd poses for the photo (E7)', () => {
  const page = readPage('en', [])!
  const plan = routePlan(page)
  const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))
  const layout = layoutRoute(plan, sizes, 16 / 9)
  const office = buildOffice(layout, undefined, 16 / 9)
  const grid = buildNavGrid(office)
  const crowd = newCrowd(crowdSpots(office, layout, grid), 20, 7, 0)

  it('everyone but the sleeper and the arcade player strikes a pose, and holds it', () => {
    expect(crowd.people.length).toBeGreaterThan(3)
    const now = 50
    for (let i = 0; i < crowd.people.length; i++) {
      const p = crowd.people[i]!
      const took = photoPose(crowd, i, now)
      expect(took).toBe(p.task !== 'sleep' && p.task !== 'play')
      if (!took) continue
      expect(isPhotoPose(p.react)).toBe(true)
      const before = poseOf(crowd, i, now)
      const posed = poseOf(crowd, i, now + (SHUTTER - PHOTO.raise))
      expect(Number.isFinite(posed.armRZ + posed.armLZ + posed.headX)).toBe(true)
      expect(before).toBeDefined()
    }
  })
})

describe('turning round for the photo and back (E7)', () => {
  const atShutter = SHUTTER - PHOTO.raise
  it('round to the camera by the shutter, back exactly as before it, all within the pose', () => {
    expect(photoTurn(0)).toBe(0)
    expect(photoTurn(PHOTO_TURN.in)).toBe(1)
    expect(photoTurn(atShutter)).toBe(1)
    expect(photoTurn(atShutter + 0.29)).toBe(1)
    expect(photoTurn(PHOTO_TURN.back + PHOTO_TURN.out)).toBe(0)
    expect(PHOTO_TURN.back + PHOTO_TURN.out).toBeLessThanOrEqual(PHOTO.pose)
    // Smooth: no jump between frames anywhere (60 fps).
    for (let u = 0; u < PHOTO.pose; u += 1 / 60) expect(Math.abs(photoTurn(u + 1 / 60) - photoTurn(u))).toBeLessThan(0.12)
  })
  it('turns the short way round', () => {
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6)
    expect(turnBetween(-3, 3)).toBeCloseTo(6 - 2 * Math.PI)
    expect(turnBetween(0.5, 1)).toBeCloseTo(0.5)
  })
  const eye: [number, number, number] = [3, 1.7, 4]
  const base = { at: [0, 0, 0] as [number, number, number], yaw: Math.PI, lieX: 0 }
  it('someone with their back to the camera faces it at full turn, and is exactly as before at none', () => {
    const person = { ...poseOfStanding(), ...base }
    const turned = turnToCamera(person, eye, 1)
    expect(lookAtGuest(turned, eye).yaw).toBeCloseTo(0)
    expect(turnToCamera(person, eye, 0)).toBe(person)
    // Facing away, they could not look at the guest at all; turned, fully.
    expect(lookAtGuest(person, eye).weight).toBe(0)
  })
  it('at a desk, round on the swivel chair: the same distance from its stem', () => {
    const person = { ...poseOfStanding(), ...base, at: [0.3, 0, 0] as [number, number, number] }
    const pivot: [number, number, number] = [0, 0, 0]
    const turned = turnToCamera(person, eye, 1, pivot)
    expect(Math.hypot(turned.at[0], turned.at[2])).toBeCloseTo(0.3)
    expect(turnBetween(turned.yaw, Math.atan2(eye[0], eye[2]))).toBeCloseTo(0)
  })
  it('a walker stops for the photo and walks on from the same spot', () => {
    const p = { since: 10, pauseAt: 12, pauseFor: 2.7 }
    expect(walkTime(p, 12)).toBeCloseTo(2)
    expect(walkTime(p, 13.5)).toBeCloseTo(2)
    expect(walkTime(p, 15)).toBeCloseTo(2 + (15 - 14.7))
    expect(walkHalt(p, 13.5)).toBe(1)
    expect(walkHalt(p, 15)).toBe(0)
    // A later walk is not held by an old photo.
    expect(walkTime({ since: 20, pauseAt: 12, pauseFor: 2.7 }, 21)).toBeCloseTo(1)
  })
})

function poseOfStanding() {
  return { armLX: 0, armLZ: 0, armRX: 0, armRY: 0, armRZ: 0, foreL: 0, foreR: 0, legL: 0, legR: 0, shinL: 0, shinR: 0, headX: 0, headY: 0, torsoX: 0, torsoZ: 0, lift: 0 }
}
