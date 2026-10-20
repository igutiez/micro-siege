import { describe, expect, it } from 'vitest'
import {
  cannonVelocity,
  clamp,
  formatClock,
  randomWind,
  simulateTrajectory,
  solveCannonAim,
} from '../src/game/physics.ts'

describe('physics', () => {
  it('clamps and formats values', () => {
    expect(clamp(12, 0, 10)).toBe(10)
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
  })

  it('launches upward and to the right', () => {
    const velocity = cannonVelocity(45, 1)
    expect(velocity.x).toBeGreaterThan(0)
    expect(velocity.y).toBeLessThan(0)
  })

  it('builds a finite arc that advances horizontally', () => {
    const points = simulateTrajectory({ x: 280, y: 268 }, 45, 0.6, 0, { groundY: 634 })
    expect(points.length).toBeGreaterThan(10)
    expect(points[0]).toEqual({ x: 280, y: 268 })
    expect(points[points.length - 1]?.x).toBeGreaterThan(280)
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })

  it('finds an aim solution near a target', () => {
    const solution = solveCannonAim({ x: 280, y: 268 }, { x: 1000, y: 440 }, 0, 634)
    expect(solution.angle).toBeGreaterThanOrEqual(10)
    expect(solution.angle).toBeLessThanOrEqual(80)
    expect(solution.power).toBeGreaterThanOrEqual(0.25)
    expect(solution.power).toBeLessThanOrEqual(1)
    expect(solution.distance).toBeLessThan(80)
  })

  it('keeps wind within the normalized range', () => {
    for (let i = 0; i < 40; i += 1) {
      const wind = randomWind()
      expect(wind).toBeGreaterThanOrEqual(-1)
      expect(wind).toBeLessThanOrEqual(1)
      expect(wind).not.toBe(0)
    }
  })
})
