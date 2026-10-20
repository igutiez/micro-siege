import { WORLD } from './config.ts'
import type { ArenaId, Palette } from './types.ts'
import { mulberry32, TAU } from './physics.ts'

/**
 * Static, painted backdrop per arena plus a thin animated atmosphere layer.
 * The heavy scenery is rendered once into an offscreen canvas; the live canvas
 * only pays for cloud drift, birds, motes and light.
 */

const backdropCache = new Map<string, HTMLCanvasElement>()

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  rr(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.stroke()
}

function cloudPuff(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, shade: string, alpha: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.globalAlpha = alpha
  ctx.fillStyle = shade
  for (const puff of [
    { x: -54, y: 12, r: 22 },
    { x: -22, y: 3, r: 29 },
    { x: 12, y: 6, r: 25 },
    { x: 42, y: 14, r: 18 },
  ]) {
    ctx.beginPath()
    ctx.arc(puff.x, puff.y + 5, puff.r, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = color
  for (const puff of [
    { x: -54, y: 6, r: 22 },
    { x: -22, y: -5, r: 30 },
    { x: 12, y: -2, r: 26 },
    { x: 42, y: 8, r: 18 },
  ]) {
    ctx.beginPath()
    ctx.arc(puff.x, puff.y, puff.r, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = alpha * 0.32
  ctx.fillStyle = '#fff'
  for (const puff of [
    { x: -38, y: -13, r: 13 },
    { x: -6, y: -22, r: 17 },
    { x: 24, y: -15, r: 12 },
  ]) {
    ctx.beginPath()
    ctx.arc(puff.x, puff.y, puff.r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function bird(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, flap: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, size * 0.18)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - size, y + Math.sin(flap) * size * 0.25)
  ctx.quadraticCurveTo(x - size * 0.42, y - size * 0.5, x, y)
  ctx.quadraticCurveTo(x + size * 0.42, y - size * 0.5, x + size, y + Math.sin(flap) * size * 0.25)
  ctx.stroke()
  ctx.restore()
}

function ridge(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  height: number,
  color: string,
  seed: number,
  snow: string | null,
  overlap = 1.35,
): void {
  const random = mulberry32(seed)
  const points: Array<{ x: number; y: number }> = []
  let x = -80
  while (x < WORLD.w + 120) {
    const span = 90 + random() * 180
    const peak = baseY - height * (0.35 + random() * 0.65)
    points.push({ x, y: baseY - random() * 20 })
    points.push({ x: x + span * 0.48, y: peak })
    x += span
  }
  points.push({ x: WORLD.w + 120, y: baseY + 50 })
  points.push({ x: -80, y: baseY + 50 })

  ctx.beginPath()
  ctx.moveTo(points[0]?.x ?? -80, points[0]?.y ?? baseY)
  for (const point of points) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  const gradient = ctx.createLinearGradient(0, baseY - height, 0, baseY + 50)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = gradient
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.3
  for (let i = 1; i < points.length; i += 2) {
    const peak = points[i]
    if (!peak || peak.y > baseY - 10) continue
    ctx.beginPath()
    ctx.moveTo(peak.x - 28, peak.y + 10)
    ctx.lineTo(peak.x - 2, peak.y + 3)
    ctx.lineTo(peak.x + 24, peak.y + 12)
    ctx.stroke()
  }
  ctx.restore()

  if (snow) {
    ctx.save()
    ctx.fillStyle = snow
    for (let i = 1; i < points.length; i += 2) {
      const point = points[i]
      if (!point || point.y > baseY - height * 0.45) continue
      ctx.beginPath()
      ctx.moveTo(point.x - 18 * overlap, point.y + 8)
      ctx.lineTo(point.x, point.y - 2)
      ctx.lineTo(point.x + 20 * overlap, point.y + 9)
      ctx.lineTo(point.x + 8, point.y + 13)
      ctx.lineTo(point.x - 4, point.y + 7)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, trunk: string, pine: boolean): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = trunk
  ctx.fillRect(-2.5, -22, 5, 24)
  if (pine) {
    ctx.fillStyle = color
    for (let i = 0; i < 4; i += 1) {
      const top = -58 + i * 12
      const width = 20 - i * 4
      ctx.beginPath()
      ctx.moveTo(0, top - 19)
      ctx.lineTo(-width, top + 6)
      ctx.lineTo(width, top + 6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.moveTo(0, -76)
    ctx.lineTo(-6, -58)
    ctx.lineTo(0, -55)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(-10, -36, 15, 0, TAU)
    ctx.arc(9, -42, 18, 0, TAU)
    ctx.arc(0, -55, 16, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.arc(-12, -44, 9, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function grassTuft(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i += 1) {
    const lean = (i - 2) * 1.6
    ctx.beginPath()
    ctx.moveTo(x + i * 1.2, y)
    ctx.quadraticCurveTo(x + i * 1.2 + lean, y - 6 * s, x + i * 1.6 + lean * 1.5, y - 11 * s)
    ctx.stroke()
  }
  ctx.restore()
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, petal: string, center: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.strokeStyle = 'rgba(35,55,28,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -7)
  ctx.stroke()
  ctx.fillStyle = petal
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU
    ctx.beginPath()
    ctx.arc(Math.cos(a) * 3, -7 + Math.sin(a) * 3, 2.1, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = center
  ctx.beginPath()
  ctx.arc(0, -7, 1.6, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, light: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(-6, -6)
  ctx.lineTo(2, -9)
  ctx.lineTo(9, -3)
  ctx.lineTo(7, 1)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = light
  ctx.beginPath()
  ctx.moveTo(-5, -6)
  ctx.lineTo(2, -8)
  ctx.lineTo(5, -4)
  ctx.lineTo(-1, -2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function fence(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  for (let i = 0; i <= 5; i += 1) {
    const px = x + (w / 5) * i
    line(ctx, px, y, px + 2, y - 18, color, 2)
    line(ctx, px, y - 13, px + 2, y - 14, color, 1.5)
  }
  line(ctx, x, y - 7, x + w, y - 10, color, 1.5)
  line(ctx, x, y - 14, x + w, y - 17, color, 1.5)
  ctx.restore()
}

function ruinedTower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, palette: Palette): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = palette.mountainNear
  ctx.beginPath()
  ctx.moveTo(-26, 0)
  ctx.lineTo(-22, -56)
  ctx.lineTo(-10, -60)
  ctx.lineTo(-8, -48)
  ctx.lineTo(0, -53)
  ctx.lineTo(4, -38)
  ctx.lineTo(20, -44)
  ctx.lineTo(24, -22)
  ctx.lineTo(28, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(-10, -32, 7, 11)
  ctx.fillRect(8, -20, 9, 13)
  ctx.strokeStyle = palette.mountainFar
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-22, -26)
  ctx.lineTo(-6, -34)
  ctx.lineTo(18, -24)
  ctx.stroke()
  line(ctx, 26, -38, 37, -49, palette.mountainFar, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.moveTo(26, -38)
  ctx.lineTo(37, -49)
  ctx.lineTo(41, -42)
  ctx.lineTo(31, -35)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function windmill(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, palette: Palette): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = palette.mountainNear
  ctx.beginPath()
  ctx.moveTo(-18, 0)
  ctx.lineTo(-11, -58)
  ctx.lineTo(10, -58)
  ctx.lineTo(19, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(-6, -34, 11, 13)
  ctx.fillRect(-2, -15, 9, 15)
  ctx.fillStyle = palette.mountainFar
  ctx.beginPath()
  ctx.moveTo(-16, -55)
  ctx.lineTo(0, -72)
  ctx.lineTo(18, -55)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = palette.foreground
  ctx.beginPath()
  ctx.arc(0, -57, 4, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function lighthouse(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, palette: Palette): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = palette.cloud
  ctx.beginPath()
  ctx.moveTo(-10, 0)
  ctx.lineTo(-7, -66)
  ctx.lineTo(7, -66)
  ctx.lineTo(11, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(-8, -42, 16, 5)
  ctx.fillRect(-9, -22, 18, 5)
  ctx.fillStyle = palette.accent
  ctx.fillRect(-7, -72, 14, 7)
  ctx.fillStyle = palette.foreground
  ctx.beginPath()
  ctx.moveTo(-9, -72)
  ctx.lineTo(0, -80)
  ctx.lineTo(9, -72)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function pond(ctx: CanvasRenderingContext2D, palette: Palette): void {
  ctx.save()
  ctx.fillStyle = palette.water
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.ellipse(610, 492, 120, 22, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 0.28
  ctx.fillStyle = palette.cloud
  for (let i = 0; i < 7; i += 1) {
    const x = 520 + i * 27
    ctx.beginPath()
    ctx.ellipse(x, 488 + Math.sin(i) * 4, 15, 1.4, 0, 0, TAU)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(30,70,50,0.45)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 9; i += 1) {
    const x = 530 + i * 17
    const h = 10 + (i % 3) * 4
    line(ctx, x, 491, x + 2, 491 - h, 'rgba(30,70,50,0.45)', 1.2)
  }
  ctx.restore()
}

function path(ctx: CanvasRenderingContext2D, palette: Palette): void {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(470, 520)
  ctx.quadraticCurveTo(560, 540, 780, 540)
  ctx.quadraticCurveTo(950, 540, 1010, 528)
  ctx.lineTo(1010, 548)
  ctx.quadraticCurveTo(900, 566, 740, 558)
  ctx.quadraticCurveTo(570, 552, 450, 536)
  ctx.closePath()
  ctx.fillStyle = 'rgba(70,52,38,0.24)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,243,214,0.1)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function noiseOverlay(ctx: CanvasRenderingContext2D, seed: number): void {
  const random = mulberry32(seed)
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 900; i += 1) {
    const x = random() * WORLD.w
    const y = random() * WORLD.h
    const s = random() > 0.86 ? 1.5 : 0.8
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#000'
  for (let i = 0; i < 500; i += 1) {
    const x = random() * WORLD.w
    const y = 260 + random() * 460
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

function paintBackdrop(palette: Palette, arena: ArenaId): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WORLD.w
  canvas.height = WORLD.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const horizon = 492
  const key = arena

  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 20)
  sky.addColorStop(0, palette.skyTop)
  sky.addColorStop(0.42, palette.skyBottom)
  sky.addColorStop(0.74, palette.sunGlow)
  sky.addColorStop(1, palette.hillFar)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)

  // A low sun with layered corona and long, fixed god-rays.
  const sunX = WORLD.w * 0.73
  const sunY = 164
  const ray = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 310)
  ray.addColorStop(0, palette.sunGlow)
  ray.addColorStop(0.35, palette.sunGlow)
  ray.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.5
  ctx.fillStyle = ray
  ctx.beginPath()
  ctx.arc(sunX, sunY, 310, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.save()
  ctx.translate(sunX, sunY)
  ctx.rotate(-0.12)
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * TAU
    const width = 0.035 + (i % 3) * 0.014
    ctx.fillStyle = palette.sunGlow
    ctx.globalAlpha = 0.055 + (i % 2) * 0.025
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a - width) * 720, Math.sin(a - width) * 720)
    ctx.lineTo(Math.cos(a + width) * 720, Math.sin(a + width) * 720)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = palette.sun
  ctx.beginPath()
  ctx.arc(sunX, sunY, 47, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 0.2
  ctx.beginPath()
  ctx.arc(sunX, sunY, 67, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1

  // High, almost-still clouds painted into the backdrop; animated clouds pass in front.
  cloudPuff(ctx, 205, 140, 1.1, palette.cloud, palette.mountainFar, 0.26)
  cloudPuff(ctx, 960, 82, 0.82, palette.cloud, palette.mountainFar, 0.2)
  cloudPuff(ctx, 1150, 222, 0.58, palette.cloud, palette.mountainFar, 0.16)

  const snow = arena === 'lagoon' || arena === 'meadow' ? 'rgba(255,250,232,0.72)' : null
  ridge(ctx, 382, 148, palette.mountainFar, 19, snow)
  ridge(ctx, 414, 98, palette.mountainNear, 41, null)
  ridge(ctx, 448, 52, palette.hillFar, 73, null)

  // Haze between mountain bands.
  const haze = ctx.createLinearGradient(0, 370, 0, 500)
  haze.addColorStop(0, 'rgba(255,255,255,0)')
  haze.addColorStop(0.45, palette.fog)
  haze.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 360, WORLD.w, 160)

  // Landmark on the horizon: one per arena, deliberately small and low-contrast.
  if (key === 'dusk') ruinedTower(ctx, 640, 448, 0.82, palette)
  if (key === 'lagoon') lighthouse(ctx, 650, 447, 0.78, palette)
  if (key === 'meadow') windmill(ctx, 621, 452, 0.82, palette)
  if (key === 'ember') {
    ruinedTower(ctx, 620, 450, 0.9, palette)
    ruinedTower(ctx, 684, 455, 0.62, palette)
  }

  // Midground hills.
  ctx.beginPath()
  ctx.moveTo(-50, WORLD.h)
  ctx.lineTo(-50, 475)
  ctx.quadraticCurveTo(170, 430, 350, 468)
  ctx.quadraticCurveTo(540, 500, 730, 462)
  ctx.quadraticCurveTo(960, 418, 1180, 470)
  ctx.quadraticCurveTo(1250, 482, 1330, 462)
  ctx.lineTo(1330, WORLD.h)
  ctx.closePath()
  const hill = ctx.createLinearGradient(0, 440, 0, 560)
  hill.addColorStop(0, palette.hillNear)
  hill.addColorStop(1, palette.ground)
  ctx.fillStyle = hill
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = palette.grass
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-20, 476)
  ctx.quadraticCurveTo(210, 438, 410, 470)
  ctx.quadraticCurveTo(620, 500, 820, 466)
  ctx.quadraticCurveTo(1040, 432, 1300, 470)
  ctx.stroke()
  ctx.restore()

  if (key === 'lagoon') pond(ctx, palette)
  path(ctx, palette)

  // A sparse forest across the horizon, a wind-bent tree line.
  const random = mulberry32(118)
  for (let i = 0; i < 34; i += 1) {
    const x = 20 + random() * (WORLD.w - 40)
    const y = 486 + random() * 32
    const s = 0.32 + random() * 0.55
    if (x > 120 && x < 420) continue
    if (x > 500 && x < 760) continue
    if (x > 840 && x < 1160) continue
    tree(ctx, x, y, s, palette.hillFar, palette.foreground, random() > 0.45)
  }

  // Ground.
  const ground = ctx.createLinearGradient(0, horizon, 0, WORLD.h)
  ground.addColorStop(0, palette.hillNear)
  ground.addColorStop(0.35, palette.ground)
  ground.addColorStop(1, palette.groundDark)
  ctx.fillStyle = ground
  ctx.beginPath()
  ctx.moveTo(0, horizon + 18)
  for (let x = 0; x <= WORLD.w; x += 70) {
    ctx.lineTo(x, horizon + 17 + Math.sin(x * 0.011 + 1.7) * 8 + Math.sin(x * 0.031) * 3)
  }
  ctx.lineTo(WORLD.w, WORLD.h)
  ctx.lineTo(0, WORLD.h)
  ctx.closePath()
  ctx.fill()

  // Grass edge and a slightly darker front lip for depth.
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = palette.grass
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= WORLD.w; x += 26) {
    const y = horizon + 18 + Math.sin(x * 0.011 + 1.7) * 8
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  // Ground detail: stones, grass tufts, flowers, fence, hay bales and a small shrine.
  for (let i = 0; i < 26; i += 1) {
    const x = 15 + random() * (WORLD.w - 30)
    const y = 515 + random() * 155
    rock(ctx, x, y, 0.55 + random() * 0.9, palette.mountainNear, palette.mountainFar)
  }
  for (let i = 0; i < 80; i += 1) {
    const x = random() * WORLD.w
    const y = 505 + random() * 185
    grassTuft(ctx, x, y, 0.55 + random() * 0.9, palette.grass, 0.35 + random() * 0.35)
  }
  const petals = arena === 'ember' ? ['#ffcf5c', '#e0764a', '#ffb09a'] : arena === 'lagoon' ? ['#d9fff6', '#ffd36e', '#b9e68a'] : ['#ffe08a', '#ffb09a', '#d7f7b4']
  for (let i = 0; i < 28; i += 1) {
    const x = 20 + random() * (WORLD.w - 40)
    const y = 520 + random() * 150
    if (x > 140 && x < 430) continue
    if (x > 850 && x < 1140) continue
    flower(ctx, x, y, 0.65 + random() * 0.65, petals[i % petals.length] ?? '#ffe08a', '#6b4a2a')
  }
  fence(ctx, 470, 518, 170, 'rgba(55,40,30,0.45)')
  fence(ctx, 930, 522, 130, 'rgba(55,40,30,0.38)')

  // Small roadside shrine: roof, post and lantern.
  ctx.save()
  ctx.translate(1150, 522)
  fill(ctx, -12, -34, 24, 34, 3, '#6a4a2c')
  ctx.fillStyle = palette.accent
  ctx.beginPath()
  ctx.moveTo(-20, -32)
  ctx.lineTo(0, -48)
  ctx.lineTo(20, -32)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2e241d'
  ctx.fillRect(-6, -24, 12, 13)
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.arc(0, -17, 3, 0, TAU)
  ctx.fill()
  ctx.restore()

  // Foreground silhouette corners; they frame the battlefield without hiding it.
  ctx.save()
  ctx.fillStyle = palette.foreground
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.moveTo(0, WORLD.h)
  ctx.lineTo(0, 650)
  ctx.quadraticCurveTo(28, 632, 48, 646)
  ctx.quadraticCurveTo(75, 660, 108, 646)
  ctx.lineTo(145, WORLD.h)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(WORLD.w, WORLD.h)
  ctx.lineTo(WORLD.w, 630)
  ctx.quadraticCurveTo(1230, 615, 1200, 638)
  ctx.quadraticCurveTo(1160, 662, 1110, 650)
  ctx.lineTo(1080, WORLD.h)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  for (let i = 0; i < 12; i += 1) {
    const x = 20 + random() * 110
    grassTuft(ctx, x, 660 + random() * 50, 1.2 + random() * 1.1, palette.foreground, 0.8)
  }
  for (let i = 0; i < 10; i += 1) {
    const x = 1120 + random() * 140
    grassTuft(ctx, x, 660 + random() * 50, 1.2 + random() * 1.1, palette.foreground, 0.8)
  }

  noiseOverlay(ctx, arena === 'ember' ? 611 : arena === 'lagoon' ? 313 : arena === 'meadow' ? 811 : 509)
  return canvas
}

function backdropKey(palette: Palette, arena: ArenaId): string {
  return `${arena}:${palette.skyTop}:${palette.skyBottom}:${palette.ground}`
}

function getBackdrop(palette: Palette, arena: ArenaId): HTMLCanvasElement {
  const key = backdropKey(palette, arena)
  const cached = backdropCache.get(key)
  if (cached) return cached
  const canvas = paintBackdrop(palette, arena)
  backdropCache.set(key, canvas)
  return canvas
}

function fireflies(ctx: CanvasRenderingContext2D, time: number, color: string): void {
  for (let i = 0; i < 15; i += 1) {
    const x = ((i * 79 + Math.sin(time * 0.24 + i) * 30) % WORLD.w + WORLD.w) % WORLD.w
    const y = 350 + (i * 43) % 210 + Math.sin(time * 0.7 + i * 2) * 8
    const alpha = 0.25 + (Math.sin(time * 1.8 + i) * 0.5 + 0.5) * 0.5
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 1.3, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = alpha * 0.25
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function embers(ctx: CanvasRenderingContext2D, time: number): void {
  for (let i = 0; i < 20; i += 1) {
    const x = 560 + ((i * 37 + Math.sin(time * 0.5 + i) * 20) % 160)
    const y = 480 - ((time * (12 + (i % 5) * 4) + i * 23) % 230)
    const alpha = 0.2 + (1 - (480 - y) / 230) * 0.5
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = i % 3 === 0 ? '#ffcf5c' : '#e0764a'
    ctx.beginPath()
    ctx.arc(x, y, 1 + (i % 2) * 0.7, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function pollen(ctx: CanvasRenderingContext2D, time: number): void {
  for (let i = 0; i < 24; i += 1) {
    const x = ((i * 101 + time * (5 + (i % 4) * 3)) % WORLD.w + WORLD.w) % WORLD.w
    const y = 330 + ((i * 53 + Math.sin(time * 0.4 + i) * 20) % 260)
    ctx.save()
    ctx.globalAlpha = 0.18 + (i % 5) * 0.05
    ctx.fillStyle = i % 3 === 0 ? '#fff6cf' : '#d7f7b4'
    ctx.beginPath()
    ctx.arc(x, y, 1.2, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function windStreaks(ctx: CanvasRenderingContext2D, time: number, color: string): void {
  ctx.save()
  ctx.globalAlpha = 0.045
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i += 1) {
    const x = ((time * (14 + i * 4) + i * 260) % (WORLD.w + 200)) - 100
    const y = 196 + i * 73
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 24, y - 4, x + 52, y + 1)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawDetailedBackground(ctx: CanvasRenderingContext2D, palette: Palette, time: number, arena: ArenaId): void {
  ctx.drawImage(getBackdrop(palette, arena), 0, 0)

  cloudPuff(ctx, ((time * 4.2 + 240) % (WORLD.w + 500)) - 220, 144, 1.0, palette.cloud, palette.mountainFar, 0.22)
  cloudPuff(ctx, ((time * 3.4 + 920) % (WORLD.w + 460)) - 200, 222, 0.66, palette.cloud, palette.mountainFar, 0.17)
  cloudPuff(ctx, ((time * 2.7 + 1340) % (WORLD.w + 380)) - 180, 96, 0.48, palette.cloud, palette.mountainFar, 0.12)

  // Warm/cool shimmer along the horizon.
  const shimmer = ctx.createLinearGradient(0, 410, 0, 505)
  shimmer.addColorStop(0, 'rgba(255,255,255,0)')
  shimmer.addColorStop(0.55, palette.fog)
  shimmer.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.save()
  ctx.globalAlpha = 0.22 + Math.sin(time * 0.4) * 0.04
  ctx.fillStyle = shimmer
  ctx.fillRect(0, 405, WORLD.w, 100)
  ctx.restore()

  const birdColor = 'rgba(24,22,28,0.42)'
  bird(ctx, 260 + Math.sin(time * 0.24) * 22, 122, 7, birdColor, time * 8)
  bird(ctx, 298 + Math.sin(time * 0.24 + 0.35) * 24, 138, 5, birdColor, time * 7.3)
  bird(ctx, 1010 + Math.sin(time * 0.2 + 2) * 30, 102, 6, birdColor, time * 8.6)
  bird(ctx, 1044 + Math.sin(time * 0.2 + 2.4) * 28, 118, 4.5, birdColor, time * 9.2)

  windStreaks(ctx, time, palette.cloud)

  if (arena === 'dusk') {
    fireflies(ctx, time, '#ffe08a')
    // Distant tattered banner on the ruin.
    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.fillStyle = '#b24f43'
    ctx.beginPath()
    ctx.moveTo(666, 402)
    ctx.quadraticCurveTo(680 + Math.sin(time * 2) * 3, 406, 690, 402)
    ctx.lineTo(686, 418)
    ctx.quadraticCurveTo(676, 415, 666, 418)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else if (arena === 'lagoon') {
    fireflies(ctx, time, '#baf5e8')
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#d9fff6'
    for (let i = 0; i < 8; i += 1) {
      const x = 520 + ((i * 27 + time * 8) % 190)
      ctx.beginPath()
      ctx.ellipse(x, 488, 12, 1.2, 0, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    // Slow lighthouse beam.
    ctx.save()
    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#fff6cf'
    ctx.beginPath()
    ctx.moveTo(650, 392)
    ctx.lineTo(650 + Math.cos(time * 0.22) * 330, 392 - 90)
    ctx.lineTo(650 + Math.cos(time * 0.22 + 0.16) * 330, 392 - 70)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else if (arena === 'meadow') {
    pollen(ctx, time)
    ctx.save()
    ctx.translate(621, 452)
    ctx.rotate(time * 0.22)
    ctx.strokeStyle = 'rgba(36,30,24,0.38)'
    ctx.lineWidth = 3
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -28)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-3, -28)
      ctx.lineTo(3, -28)
      ctx.stroke()
    }
    ctx.restore()
  } else {
    embers(ctx, time)
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#2c1c1b'
    for (let i = 0; i < 5; i += 1) {
      const x = 610 + i * 12 + Math.sin(time * 0.3 + i) * 10
      const y = 420 - ((time * 5 + i * 14) % 90)
      ctx.beginPath()
      ctx.arc(x, y, 8 + i * 2, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  // Slow drifting leaves in the foreground air.
  for (let i = 0; i < 5; i += 1) {
    const x = ((time * (9 + i * 2) + i * 240) % (WORLD.w + 100)) - 50
    const y = 300 + ((i * 67 + Math.sin(time * 0.6 + i) * 18) % 240)
    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = palette.grass
    ctx.translate(x, y)
    ctx.rotate(time * 0.7 + i)
    ctx.beginPath()
    ctx.ellipse(0, 0, 2.4, 1, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}
