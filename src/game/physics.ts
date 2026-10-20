import { GRAVITY, WIND_ACCEL, WORLD } from './config.ts'
import type { Vec2 } from './types.ts'

export const TAU = Math.PI * 2

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a)
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3)
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1))
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    copy[i] = b as T
    copy[j] = a as T
  }
  return copy
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pointInRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh
}

export function cannonSpeed(power: number): number {
  return 360 + clamp(power, 0, 1) * 500
}

export function cannonVelocity(angleDeg: number, power: number): Vec2 {
  const speed = cannonSpeed(power)
  const angle = degToRad(angleDeg)
  return { x: Math.cos(angle) * speed, y: -Math.sin(angle) * speed }
}

export interface TrajectoryOptions {
  groundY?: number
  maxTime?: number
  step?: number
  stopX?: number
}

/** Dotted arc preview. It deliberately mirrors the battle projectile integration. */
export function simulateTrajectory(
  from: Vec2,
  angleDeg: number,
  power: number,
  wind: number,
  options: TrajectoryOptions = {},
): Vec2[] {
  const groundY = options.groundY ?? WORLD.h - 120
  const maxTime = options.maxTime ?? 4
  const step = options.step ?? 1 / 60
  const velocity = cannonVelocity(angleDeg, power)
  let x = from.x
  let y = from.y
  let vx = velocity.x
  let vy = velocity.y
  const points: Vec2[] = [{ x, y }]
  for (let time = 0; time < maxTime; time += step) {
    vy += GRAVITY * step
    vx += wind * WIND_ACCEL * step
    x += vx * step
    y += vy * step
    points.push({ x, y })
    if (y >= groundY || x < -80 || x > WORLD.w + 80 || (options.stopX !== undefined && x > options.stopX)) break
  }
  return points
}

export interface AimSolution {
  angle: number
  power: number
  distance: number
}

/** Coarse ballistic search used by the AI. A little error is added by the caller. */
export function solveCannonAim(from: Vec2, target: Vec2, wind: number, groundY = WORLD.h - 120): AimSolution {
  let best: AimSolution = { angle: 45, power: 0.7, distance: Number.POSITIVE_INFINITY }
  for (let angle = 10; angle <= 80; angle += 2) {
    for (let power = 0.25; power <= 1.0001; power += 0.05) {
      const points = simulateTrajectory(from, angle, power, wind, { groundY, maxTime: 3.6, step: 1 / 90 })
      let closest = Number.POSITIVE_INFINITY
      for (const point of points) {
        const d = Math.hypot(point.x - target.x, point.y - target.y)
        if (d < closest) closest = d
        if (point.x > target.x + 20 && point.y > target.y) break
      }
      if (closest < best.distance) best = { angle, power, distance: closest }
    }
  }
  return best
}

/** Fires a unit projectile toward a point with a fixed muzzle speed. */
export function solveUnitAngle(from: Vec2, target: Vec2, speed: number, gravity: number, wind: number): number {
  let bestAngle = 35
  let bestDistance = Number.POSITIVE_INFINITY
  const step = 1 / 60
  for (let angle = 2; angle <= 86; angle += 1) {
    const radians = degToRad(angle)
    let x = from.x
    let y = from.y
    let vx = Math.cos(radians) * speed
    let vy = -Math.sin(radians) * speed
    let closest = Number.POSITIVE_INFINITY
    for (let time = 0; time < 4; time += step) {
      vy += gravity * step
      vx += wind * 18 * step
      x += vx * step
      y += vy * step
      const d = Math.hypot(x - target.x, y - target.y)
      if (d < closest) closest = d
      if (y > WORLD.h - 100 || x > WORLD.w + 100) break
    }
    if (closest < bestDistance) {
      bestDistance = closest
      bestAngle = angle
    }
  }
  return bestAngle
}

export function unitVelocity(from: Vec2, target: Vec2, speed: number, gravity: number, wind: number): Vec2 {
  const angle = solveUnitAngle(from, target, speed, gravity, wind)
  const radians = degToRad(angle)
  return { x: Math.cos(radians) * speed, y: -Math.sin(radians) * speed }
}

export function randomWind(): number {
  const strength = randomRange(0.15, 1)
  return (Math.random() < 0.5 ? -1 : 1) * strength
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function formatMultiplier(value: number): string {
  return Number.isInteger(value) ? `×${value}` : `×${value.toFixed(1)}`
}
