import {
  CASTLE_H,
  CASTLE_W,
  CELL,
  CORE_CELL,
  MODULES,
  UNIT_BY_ID,
  WORLD,
} from './config.ts'
import {
  moduleCell,
  sideAccent,
  type CastleEvent,
} from './castle.ts'
import { cannonPosition, cellRect, coreHpPercent, isStructural } from './castle.ts'
import { mulberry32, clamp, TAU } from './physics.ts'
import type {
  BattleHost,
  Castle,
  Cell,
  ModuleId,
  Palette,
  Particle,
  Projectile,
  Side,
  Unit,
  UnitId,
} from './types.ts'
import type { Battle } from './battle.ts'

export interface CastleDrawOptions {
  showSlots?: boolean
  selected?: ModuleId | null
  hover?: ModuleId | null
  tab?: 'build' | 'upgrade' | 'units'
  dim?: boolean
}

const INK = '#241a13'
const INK_SOFT = '#3a2a1d'
const CREAM = '#fff3d6'
const STONE = '#cdbfa7'
const STONE_LIGHT = '#e4d7bd'
const STONE_DARK = '#9a8770'
const WOOD = '#a8612f'
const WOOD_LIGHT = '#c9824c'
const WOOD_DARK = '#6e3c1d'
const GOLD = '#ffc94a'
const GOLD_DEEP = '#d8911f'
const GREEN = '#3d9a5c'
const RED = '#d6453d'
const BLUE = '#3f7fd1'

let grainCanvas: HTMLCanvasElement | null = null
let vignetteCanvas: HTMLCanvasElement | null = null

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, width: number): void {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.stroke()
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, cap: CanvasLineCap = 'round'): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = cap
  ctx.stroke()
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, points = 5, inner = 0.45): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (i * Math.PI) / points - Math.PI / 2
    const r = i % 2 === 0 ? radius : radius * inner
    const px = x + Math.cos(angle) * r
    const py = y + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
  stroke = true,
): void {
  ctx.save()
  ctx.font = `${size}px "Lilita One", "Arial Black", sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  if (stroke) {
    ctx.lineWidth = Math.max(2, size * 0.1)
    ctx.strokeStyle = INK
    ctx.lineJoin = 'round'
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawSmallText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
): void {
  ctx.save()
  ctx.font = `800 ${size}px "Nunito", system-ui, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha = 0.5): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.55, color)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function ensureGrain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas
  const canvas = document.createElement('canvas')
  canvas.width = WORLD.w
  canvas.height = WORLD.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const random = mulberry32(90210)
  const image = ctx.createImageData(WORLD.w, WORLD.h)
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(random() * 255)
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value
    image.data[i + 3] = 16
  }
  ctx.putImageData(image, 0, 0)
  grainCanvas = canvas
  return canvas
}

function ensureVignette(): HTMLCanvasElement {
  if (vignetteCanvas) return vignetteCanvas
  const canvas = document.createElement('canvas')
  canvas.width = WORLD.w
  canvas.height = WORLD.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(WORLD.w / 2, WORLD.h * 0.46, WORLD.h * 0.28, WORLD.w / 2, WORLD.h * 0.48, WORLD.w * 0.66)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.68, 'rgba(0,0,0,0.12)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.48)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)
  vignetteCanvas = canvas
  return canvas
}

export function drawPaperOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.5
  ctx.drawImage(ensureGrain(), 0, 0)
  ctx.restore()
  ctx.drawImage(ensureVignette(), 0, 0)
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, alpha: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  const puffs = [
    { x: -50, y: 8, r: 25 },
    { x: -18, y: -8, r: 34 },
    { x: 18, y: -2, r: 29 },
    { x: 48, y: 8, r: 21 },
  ]
  for (const puff of puffs) {
    ctx.beginPath()
    ctx.arc(puff.x, puff.y, puff.r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, flap: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, size * 0.18)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - size, y + Math.sin(flap) * size * 0.3)
  ctx.quadraticCurveTo(x - size * 0.4, y - size * 0.55, x, y)
  ctx.quadraticCurveTo(x + size * 0.4, y - size * 0.55, x + size, y + Math.sin(flap) * size * 0.3)
  ctx.stroke()
  ctx.restore()
}

function drawMountainLayer(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  amplitude: number,
  color: string,
  seed: number,
  offset: number,
): void {
  const random = mulberry32(seed)
  const points = 9
  ctx.beginPath()
  ctx.moveTo(-100, baseY + 40)
  for (let i = 0; i <= points; i += 1) {
    const x = (WORLD.w / points) * i + offset
    const peak = -amplitude * (0.45 + random() * 0.75)
    const mid = baseY + peak * 0.3
    ctx.lineTo(x, mid)
    ctx.lineTo(x + WORLD.w / points / 2, baseY + peak)
  }
  ctx.lineTo(WORLD.w + 100, baseY + 40)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawHillLayer(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  amplitude: number,
  color: string,
  seed: number,
  offset: number,
): void {
  const random = mulberry32(seed)
  ctx.beginPath()
  ctx.moveTo(-60, WORLD.h)
  ctx.lineTo(-60, baseY)
  let x = -60
  while (x < WORLD.w + 80) {
    const width = 140 + random() * 180
    const next = x + width
    ctx.quadraticCurveTo(x + width / 2 + offset, baseY - amplitude * (0.4 + random()), next, baseY + random() * 10)
    x = next
  }
  ctx.lineTo(WORLD.w + 80, WORLD.h)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, pine: boolean, color: string, trunk: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = trunk
  ctx.fillRect(-3, -24, 6, 26)
  if (pine) {
    ctx.fillStyle = color
    for (let i = 0; i < 3; i += 1) {
      const top = -54 + i * 14
      const width = 22 - i * 5
      ctx.beginPath()
      ctx.moveTo(0, top - 24)
      ctx.lineTo(-width, top + 8)
      ctx.lineTo(width, top + 8)
      ctx.closePath()
      ctx.fill()
    }
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(-9, -38, 17, 0, TAU)
    ctx.arc(9, -42, 20, 0, TAU)
    ctx.arc(0, -54, 18, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawGround(ctx: CanvasRenderingContext2D, palette: Palette, time: number, horizon = 492): void {
  const groundGradient = ctx.createLinearGradient(0, horizon, 0, WORLD.h)
  groundGradient.addColorStop(0, palette.hillNear)
  groundGradient.addColorStop(0.42, palette.ground)
  groundGradient.addColorStop(1, palette.groundDark)
  ctx.fillStyle = groundGradient
  ctx.beginPath()
  ctx.moveTo(0, horizon + 20)
  for (let x = 0; x <= WORLD.w; x += 80) {
    ctx.lineTo(x, horizon + 16 + Math.sin(x * 0.012 + 1.7) * 9 + Math.sin(x * 0.032) * 3)
  }
  ctx.lineTo(WORLD.w, WORLD.h)
  ctx.lineTo(0, WORLD.h)
  ctx.closePath()
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = palette.grass
  for (let i = 0; i < 32; i += 1) {
    const x = (i * 47 + 15) % WORLD.w
    const y = horizon + 20 + Math.sin(x * 0.02) * 10 + 6
    const sway = Math.sin(time * 1.4 + i) * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 2 + sway, y - 8, x + 4 + sway, y - 14)
    ctx.quadraticCurveTo(x + 5 + sway, y - 7, x + 7, y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  const random = mulberry32(71)
  for (let i = 0; i < 9; i += 1) {
    const x = 40 + random() * (WORLD.w - 80)
    const y = horizon + 26 + random() * 80
    drawTree(ctx, x, y, 0.5 + random() * 0.4, random() > 0.35, palette.hillFar, palette.foreground)
  }
}

function drawWaterfall(ctx: CanvasRenderingContext2D, palette: Palette, time: number): void {
  const x = WORLD.w * 0.84
  const y = 360
  const gradient = ctx.createLinearGradient(x, y, x, y + 190)
  gradient.addColorStop(0, 'rgba(255,255,255,0.16)')
  gradient.addColorStop(0.5, palette.water)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(x - 22, y)
  ctx.lineTo(x + 22, y)
  ctx.lineTo(x + 36, y + 190)
  ctx.lineTo(x - 36, y + 190)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  for (let i = 0; i < 5; i += 1) {
    const offset = Math.sin(time * 2 + i) * 8
    ctx.beginPath()
    ctx.moveTo(x - 14 + i * 7, y + 8)
    ctx.lineTo(x - 18 + i * 7 + offset, y + 170)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawBackground(ctx: CanvasRenderingContext2D, palette: Palette, time: number): void {
  const horizon = 470
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 20)
  sky.addColorStop(0, palette.skyTop)
  sky.addColorStop(0.64, palette.skyBottom)
  sky.addColorStop(1, palette.sunGlow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)

  drawGlow(ctx, WORLD.w * 0.73, 168, 220, palette.sunGlow, 0.5)
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = palette.sun
  ctx.beginPath()
  ctx.arc(WORLD.w * 0.73, 168, 48, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 0.18
  ctx.beginPath()
  ctx.arc(WORLD.w * 0.73, 168, 68, 0, TAU)
  ctx.fill()
  ctx.restore()

  drawCloud(ctx, ((time * 5 + 190) % (WORLD.w + 360)) - 180, 132, 1.05, palette.cloud, 0.36)
  drawCloud(ctx, ((time * 3.4 + 760) % (WORLD.w + 420)) - 210, 204, 0.7, palette.cloud, 0.28)
  drawCloud(ctx, ((time * 4.2 + 1120) % (WORLD.w + 380)) - 190, 88, 0.52, palette.cloud, 0.22)

  drawBird(ctx, 300 + Math.sin(time * 0.2) * 50, 120, 8, 'rgba(36,26,19,0.32)', time * 8)
  drawBird(ctx, 346 + Math.sin(time * 0.2 + 0.3) * 50, 138, 6, 'rgba(36,26,19,0.26)', time * 7)

  drawMountainLayer(ctx, 384, 138, palette.mountainFar, 17, Math.sin(time * 0.04) * 8)
  drawMountainLayer(ctx, 424, 82, palette.mountainNear, 43, Math.sin(time * 0.06) * 5)
  drawWaterfall(ctx, palette, time)
  drawHillLayer(ctx, 468, 36, palette.hillFar, 89, Math.sin(time * 0.08) * 4)
  drawHillLayer(ctx, 486, 22, palette.hillNear, 131, Math.sin(time * 0.1) * 3)
  drawGround(ctx, palette, time)

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = palette.fog
  ctx.fillRect(0, 380, WORLD.w, 160)
  ctx.restore()
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#2b2522'
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#ba7c3f'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.64, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK_SOFT
  ctx.lineWidth = 2
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * TAU
    ctx.beginPath()
    ctx.moveTo(Math.cos(angle) * radius * 0.15, Math.sin(angle) * radius * 0.15)
    ctx.lineTo(Math.cos(angle) * radius * 0.58, Math.sin(angle) * radius * 0.58)
    ctx.stroke()
  }
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.2, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function drawPlatform(ctx: CanvasRenderingContext2D, castle: Castle, time: number): void {
  const x = castle.x - 17
  const y = castle.y + CASTLE_H - 4
  const w = CASTLE_W + 34
  const h = 50
  const accent = sideAccent(castle.side)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.26)'
  ctx.beginPath()
  ctx.ellipse(castle.x + CASTLE_W / 2, y + h + 36, w * 0.48, 14, 0, 0, TAU)
  ctx.fill()

  drawWheel(ctx, x + 35, y + h + 12, 23)
  drawWheel(ctx, x + w / 2, y + h + 15, 26)
  drawWheel(ctx, x + w - 35, y + h + 12, 23)

  fillRound(ctx, x, y, w, h, 12, WOOD)
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(x + 7, y + 6, w - 14, 5)
  ctx.strokeStyle = '#7b4526'
  ctx.lineWidth = 2
  for (let i = 1; i < 7; i += 1) {
    const px = x + (w / 7) * i
    drawLine(ctx, px, y + 7, px, y + h - 5, 'rgba(74,40,20,0.4)', 1.5)
  }
  ctx.strokeStyle = '#4f3b2d'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(x + 5, y + h - 11)
  ctx.lineTo(x + w - 5, y + h - 11)
  ctx.stroke()
  for (const px of [x + 18, x + w - 18, x + w / 2]) {
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(px, y + h / 2 + 2, 4, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = INK_SOFT
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.fillStyle = accent.main
  fillRound(ctx, x + w / 2 - 28, y + 4, 56, 13, 5, accent.main)
  strokeRound(ctx, x + w / 2 - 28, y + 4, 56, 13, 5, INK_SOFT, 2)
  drawSmallText(ctx, castle.side === 'player' ? 'TU FORTALEZA' : 'RIVAL', x + w / 2, y + 11, 8, CREAM)
  ctx.restore()
}

function drawStoneCell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string, damage: number): void {
  fillRound(ctx, x, y, w, h, 5, STONE)
  ctx.save()
  ctx.beginPath()
  roundRectPath(ctx, x, y, w, h, 5)
  ctx.clip()
  ctx.fillStyle = STONE_LIGHT
  ctx.fillRect(x, y, w, 6)
  ctx.fillStyle = STONE_DARK
  ctx.fillRect(x, y + h - 7, w, 7)
  const rows = 3
  for (let row = 0; row < rows; row += 1) {
    const yy = y + 8 + (row * (h - 12)) / rows
    for (let col = 0; col < 3; col += 1) {
      const xx = x + 3 + (col * (w - 6)) / 3 + (row % 2) * 4
      fillRound(ctx, xx, yy, (w - 10) / 3, (h - 12) / rows - 3, 2, 'rgba(255,255,255,0.07)')
      ctx.strokeStyle = 'rgba(106,86,64,0.35)'
      ctx.lineWidth = 1
      roundRectPath(ctx, xx, yy, (w - 10) / 3, (h - 12) / rows - 3, 2)
      ctx.stroke()
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(x + 4, y + 8, 5, h - 14)
  ctx.restore()
  strokeRound(ctx, x, y, w, h, 5, INK, 3)
  if (damage > 0.3) {
    ctx.save()
    ctx.strokeStyle = 'rgba(36,26,19,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + w * 0.2, y + 4)
    ctx.lineTo(x + w * 0.34, y + h * 0.42)
    ctx.lineTo(x + w * 0.25, y + h * 0.7)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + w * 0.62, y + 5)
    ctx.lineTo(x + w * 0.54, y + h * 0.36)
    ctx.lineTo(x + w * 0.72, y + h * 0.62)
    ctx.stroke()
    ctx.restore()
  }
  if (damage > 0.65) {
    ctx.save()
    ctx.fillStyle = 'rgba(36,26,19,0.28)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.52, y + h * 0.52)
    ctx.lineTo(x + w * 0.72, y + h * 0.38)
    ctx.lineTo(x + w * 0.88, y + h * 0.54)
    ctx.lineTo(x + w * 0.76, y + h * 0.8)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 7, y + h - 9)
  ctx.lineTo(x + w - 7, y + h - 9)
  ctx.stroke()
  ctx.restore()
}

function drawTower(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  drawStoneCell(ctx, x + 5, y + 16, w - 10, h - 16, accent.main, damage)
  ctx.save()
  ctx.fillStyle = STONE_LIGHT
  for (let i = 0; i < 3; i += 1) {
    fillRound(ctx, x + 3 + i * (w - 6) / 3, y + 8, (w - 10) / 3, 9, 2, STONE_LIGHT)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    roundRectPath(ctx, x + 3 + i * (w - 6) / 3, y + 8, (w - 10) / 3, 9, 2)
    ctx.stroke()
  }
  ctx.fillStyle = accent.main
  ctx.beginPath()
  ctx.moveTo(x - 6, y + 10)
  ctx.lineTo(x + w / 2, y - 30)
  ctx.lineTo(x + w + 6, y + 10)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = accent.dark
  ctx.beginPath()
  ctx.moveTo(x + 3, y + 8)
  ctx.lineTo(x + w / 2, y - 18)
  ctx.lineTo(x + w - 3, y + 8)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(x + 3, y + 8)
  ctx.lineTo(x + w / 2, y - 18)
  ctx.lineTo(x + w / 2, y + 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  drawLine(ctx, x + w / 2, y - 28, x + w / 2, y - 58, INK, 3)
  const flag = Math.sin(castle.side === 'player' ? 1 : 2) * 2
  ctx.save()
  ctx.fillStyle = accent.light
  ctx.beginPath()
  ctx.moveTo(x + w / 2, y - 57)
  ctx.quadraticCurveTo(x + w / 2 + 18, y - 54 + flag, x + w / 2 + 28, y - 48)
  ctx.lineTo(x + w / 2, y - 42)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  drawStoneCell(ctx, x + 5, y + h - 12, w - 10, 14, accent.main, damage)
}

function drawRoof(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  ctx.save()
  ctx.fillStyle = STONE
  fillRound(ctx, x + 2, y + 24, w - 4, h - 24, 5, STONE)
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  roundRectPath(ctx, x + 2, y + 24, w - 4, h - 24, 5)
  ctx.stroke()
  ctx.fillStyle = accent.main
  ctx.beginPath()
  ctx.moveTo(x - 10, y + 28)
  ctx.lineTo(x + w / 2, y - 26)
  ctx.lineTo(x + w + 10, y + 28)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = accent.dark
  ctx.beginPath()
  ctx.moveTo(x + 2, y + 25)
  ctx.lineTo(x + w / 2, y - 10)
  ctx.lineTo(x + w - 2, y + 25)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(x + 2, y + 25)
  ctx.lineTo(x + w / 2, y - 10)
  ctx.lineTo(x + w / 2, y + 10)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  for (let i = 0; i < 4; i += 1) {
    fillRound(ctx, x + 5 + i * (w - 10) / 4, y + 28, (w - 10) / 4 - 3, 10, 2, STONE_LIGHT)
    strokeRound(ctx, x + 5 + i * (w - 10) / 4, y + 28, (w - 10) / 4 - 3, 10, 2, INK, 2)
  }
  if (damage > 0.4) {
    ctx.save()
    ctx.strokeStyle = 'rgba(36,26,19,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 10, y + 30)
    ctx.lineTo(x + 24, y + 46)
    ctx.lineTo(x + 16, y + h - 6)
    ctx.stroke()
    ctx.restore()
  }
}

function drawBase(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  drawStoneCell(ctx, x, y, w, h, accent.main, damage)
  ctx.save()
  ctx.fillStyle = WOOD
  fillRound(ctx, x + 5, y + h - 18, w - 10, 13, 3, WOOD)
  ctx.strokeStyle = INK_SOFT
  ctx.lineWidth = 2
  roundRectPath(ctx, x + 5, y + h - 18, w - 10, 13, 3)
  ctx.stroke()
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.5
  for (let i = 1; i < 4; i += 1) drawLine(ctx, x + 5 + (i * (w - 10)) / 4, y + h - 17, x + 5 + (i * (w - 10)) / 4, y + h - 6, 'rgba(74,40,20,0.4)', 1)
  ctx.fillStyle = GOLD
  for (const px of [x + 12, x + w - 12]) {
    ctx.beginPath()
    ctx.arc(px, y + h - 11, 3, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawRoom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number, accent: string): void {
  ctx.save()
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  gradient.addColorStop(0, 'rgba(20,16,14,0.94)')
  gradient.addColorStop(0.7, 'rgba(35,26,21,0.92)')
  gradient.addColorStop(1, 'rgba(53,37,27,0.94)')
  ctx.fillStyle = gradient
  ctx.fillRect(x + 2, y + 4, w - 4, h - 4)
  ctx.strokeStyle = 'rgba(36,26,19,0.8)'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 2, y + 4, w - 4, h - 4)
  ctx.fillStyle = WOOD
  fillRound(ctx, x + 2, y + h - 15, w - 4, 11, 2, WOOD)
  ctx.strokeStyle = WOOD_DARK
  ctx.lineWidth = 1.5
  for (let i = 1; i < 4; i += 1) drawLine(ctx, x + 3 + (i * (w - 6)) / 4, y + h - 14, x + 3 + (i * (w - 6)) / 4, y + h - 5, 'rgba(74,40,20,0.55)', 1)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(x + 6, y + 8, 4, h - 26)
  const torchX = x + w - 10
  const torchY = y + 18
  ctx.strokeStyle = '#4b2c1a'
  ctx.lineWidth = 3
  drawLine(ctx, torchX, torchY, torchX, torchY + 10, '#4b2c1a', 3)
  drawGlow(ctx, torchX, torchY, 25, '#ffb85c', 0.35)
  ctx.fillStyle = '#ffd36e'
  ctx.beginPath()
  ctx.ellipse(torchX, torchY + 1, 4 + Math.sin(time * 9) * 1.2, 7 + Math.cos(time * 7) * 1.5, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.28
  ctx.fillRect(x + 4, y + 4, 3, h - 18)
  ctx.restore()
}

function drawCore(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell, time: number): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  ctx.save()
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  gradient.addColorStop(0, '#241b17')
  gradient.addColorStop(1, '#3a2720')
  ctx.fillStyle = gradient
  fillRound(ctx, x + 2, y + 2, w - 4, h - 4, 5, '#241b17')
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  roundRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 5)
  ctx.stroke()
  ctx.fillStyle = accent.dark
  ctx.beginPath()
  ctx.moveTo(x + 8, y + h - 8)
  ctx.lineTo(x + 8, y + 18)
  ctx.quadraticCurveTo(x + w / 2, y - 1, x + w - 8, y + 18)
  ctx.lineTo(x + w - 8, y + h - 8)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = GOLD_DEEP
  ctx.lineWidth = 2
  ctx.stroke()
  drawGlow(ctx, x + w / 2, y + h / 2, 32, accent.light, 0.22 + Math.sin(time * 2) * 0.05)
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h / 2 - 2, 12, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = accent.light
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h / 2 - 2, 7, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff7d6'
  ctx.beginPath()
  ctx.arc(x + w / 2 - 3, y + h / 2 - 6, 3, 0, TAU)
  ctx.fill()
  ctx.fillStyle = accent.main
  ctx.fillRect(x + 4, y + 8, 4, h - 16)
  ctx.fillRect(x + w - 8, y + 8, 4, h - 16)
  if (damage > 0.3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x + w * 0.2, y + 5)
    ctx.lineTo(x + w * 0.35, y + h * 0.55)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRubble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const random = mulberry32(seed)
  ctx.save()
  for (let i = 0; i < 8; i += 1) {
    const px = x + 5 + random() * (w - 14)
    const py = y + h - 6 - random() * 10
    const size = 5 + random() * 9
    ctx.fillStyle = random() > 0.4 ? STONE_DARK : WOOD_DARK
    ctx.beginPath()
    ctx.moveTo(px, py - size)
    ctx.lineTo(px + size, py - size * 0.3)
    ctx.lineTo(px + size * 0.7, py)
    ctx.lineTo(px - size * 0.4, py)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h - 3, w * 0.42, 5, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawCell(ctx: CanvasRenderingContext2D, castle: Castle, cell: Cell, time: number): void {
  if (cell.kind === 'empty') return
  const rect = cellRect(castle, cell)
  const x = rect.x
  const y = rect.y
  const w = CELL
  const h = CELL
  const accent = sideAccent(castle.side)
  if (cell.falling) {
    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(cell.fallRotation)
    ctx.translate(-x - w / 2, -y - h / 2)
  }
  switch (cell.kind) {
    case 'tower':
      drawTower(ctx, castle, x, y, w, h, cell)
      break
    case 'roof':
      drawRoof(ctx, castle, x, y, w, h, cell)
      break
    case 'wall':
      drawStoneCell(ctx, x, y, w, h, accent.main, 1 - cell.hp / cell.maxHp)
      ctx.save()
      ctx.fillStyle = WOOD
      fillRound(ctx, x + 5, y + h - 12, w - 10, 7, 2, WOOD)
      ctx.strokeStyle = WOOD_DARK
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i += 1) drawLine(ctx, x + 6 + (i * (w - 12)) / 4, y + h - 11, x + 6 + (i * (w - 12)) / 4, y + h - 6, 'rgba(74,40,20,0.5)', 1)
      ctx.restore()
      break
    case 'base':
      drawBase(ctx, castle, x, y, w, h, cell)
      break
    case 'core':
      drawCore(ctx, castle, x, y, w, h, cell, time)
      break
    case 'room':
      drawRoom(ctx, x, y, w, h, time, accent.main)
      break
    case 'rubble':
      drawRubble(ctx, x, y, w, h, cell.col * 13 + cell.row * 7)
      break
    default:
      break
  }
  if (cell.hitFlash > 0) {
    ctx.save()
    ctx.globalAlpha = cell.hitFlash * 0.18
    ctx.fillStyle = '#fff'
    fillRound(ctx, x, y, w, h, 4, '#fff')
    ctx.restore()
  }
  if (cell.falling) ctx.restore()
}

function drawCastleBacking(ctx: CanvasRenderingContext2D, castle: Castle): void {
  ctx.save()
  ctx.globalAlpha = 0.42
  for (const cell of castle.cells) {
    if (cell.kind === 'empty' || cell.kind === 'room' || cell.kind === 'rubble') continue
    const rect = cellRect(castle, cell)
    fillRound(ctx, rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 7, INK)
  }
  const core = castle.core
  const coreRect = cellRect(castle, core)
  fillRound(ctx, coreRect.x - 5, coreRect.y - 5, coreRect.w + 10, coreRect.h + 10, 8, INK)
  ctx.restore()
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, time: number, portrait = false): void {
  if (unit.dead) return
  const def = UNIT_BY_ID[unit.kind]
  const bob = portrait ? 0 : Math.sin(unit.bob + time * 0.6) * 1.4
  const recoil = unit.recoil * 3
  const accent = def.color
  const light = def.accent
  ctx.save()
  ctx.translate(unit.x, unit.y + bob)
  if (unit.side === 'enemy') ctx.scale(-1, 1)
  ctx.translate(-recoil * 0.3, 0)
  if (!portrait) {
    ctx.fillStyle = 'rgba(0,0,0,0.26)'
    ctx.beginPath()
    ctx.ellipse(0, 1, 12, 3.5, 0, 0, TAU)
    ctx.fill()
  }

  const body = (base: string, dark: string, w = 16, h = 18, y = -20): void => {
    ctx.fillStyle = dark
    fillRound(ctx, -w / 2 + 1, y + 4, w, h, 4, dark)
    ctx.fillStyle = base
    fillRound(ctx, -w / 2, y, w, h - 2, 4, base)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    roundRectPath(ctx, -w / 2, y, w, h - 2, 4)
    ctx.stroke()
  }

  const legs = (color: string): void => {
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    drawLine(ctx, -4, -4, -5, -1, color, 3)
    drawLine(ctx, 4, -4, 5, -1, color, 3)
  }

  const head = (skin: string, size = 7, y = -31): void => {
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(0, y, size, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.8
    ctx.stroke()
  }

  const eye = (y = -30): void => {
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(2.5, y, 1.1, 0, TAU)
    ctx.fill()
  }

  switch (unit.kind) {
    case 'archer': {
      legs('#335c36')
      body(def.color, '#2f5c38', 15, 17, -21)
      head('#f0c28a', 6.5, -31)
      ctx.fillStyle = '#2f5c38'
      ctx.beginPath()
      ctx.moveTo(-9, -29)
      ctx.quadraticCurveTo(0, -44, 9, -29)
      ctx.lineTo(6, -26)
      ctx.quadraticCurveTo(0, -36, -6, -26)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      eye(-31)
      ctx.strokeStyle = '#8a5a2b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(10, -22, 12, -Math.PI * 0.55, Math.PI * 0.55)
      ctx.stroke()
      drawLine(ctx, 10 + Math.cos(-Math.PI * 0.55) * 12, -22 + Math.sin(-Math.PI * 0.55) * 12, 10 + Math.cos(Math.PI * 0.55) * 12, -22 + Math.sin(Math.PI * 0.55) * 12, '#efe0c0', 0.8)
      break
    }
    case 'knight': {
      legs('#3c4c62')
      body(def.color, '#2e4366', 19, 18, -22)
      head('#d8dde6', 7.5, -33)
      ctx.fillStyle = '#d8dde6'
      ctx.beginPath()
      ctx.moveTo(-8, -35)
      ctx.lineTo(0, -44)
      ctx.lineTo(8, -35)
      ctx.lineTo(5, -29)
      ctx.lineTo(-5, -29)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.fillStyle = '#d94b42'
      ctx.beginPath()
      ctx.moveTo(0, -44)
      ctx.quadraticCurveTo(10, -50, 14, -42)
      ctx.quadraticCurveTo(5, -40, 0, -39)
      ctx.fill()
      ctx.fillStyle = '#e8eef7'
      ctx.beginPath()
      ctx.arc(-10, -20, 8, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = def.color
      ctx.beginPath()
      ctx.arc(-10, -20, 5, 0, TAU)
      ctx.fill()
      drawLine(ctx, 9, -28, 18, -6, '#cfd8e5', 2.5)
      ctx.fillStyle = '#eef4fb'
      ctx.beginPath()
      ctx.moveTo(18, -6)
      ctx.lineTo(21, -12)
      ctx.lineTo(24, -5)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'bomber': {
      legs('#5b3a21')
      body(def.color, '#8e4e1f', 17, 17, -21)
      head('#4a3a2e', 7, -31)
      ctx.fillStyle = '#3b2f27'
      ctx.beginPath()
      ctx.arc(0, -31, 8, Math.PI, 0)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.fillStyle = '#2b2320'
      ctx.beginPath()
      ctx.arc(12, -17, 5.5, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.strokeStyle = '#d9a24f'
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(12, -22)
      ctx.quadraticCurveTo(16, -30, 20, -27)
      ctx.stroke()
      drawGlow(ctx, 20, -27, 8, '#ffb85c', 0.4)
      eye(-30)
      break
    }
    case 'siege': {
      ctx.fillStyle = WOOD_DARK
      fillRound(ctx, -18, -13, 36, 11, 4, WOOD_DARK)
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      roundRectPath(ctx, -18, -13, 36, 11, 4)
      ctx.stroke()
      for (const wx of [-12, 12]) {
        ctx.fillStyle = '#2b2522'
        ctx.beginPath()
        ctx.arc(wx, -2, 6, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = INK
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = GOLD
        ctx.beginPath()
        ctx.arc(wx, -2, 2, 0, TAU)
        ctx.fill()
      }
      ctx.fillStyle = WOOD
      fillRound(ctx, -12, -24, 24, 12, 4, WOOD)
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      roundRectPath(ctx, -12, -24, 24, 12, 4)
      ctx.stroke()
      ctx.fillStyle = '#4f4a45'
      ctx.beginPath()
      ctx.moveTo(-8, -22)
      ctx.lineTo(14, -34)
      ctx.lineTo(20, -30)
      ctx.lineTo(-2, -18)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
    case 'mage': {
      legs('#4a3268')
      body(def.color, '#4a3268', 16, 20, -24)
      head('#eec49a', 6.5, -34)
      ctx.fillStyle = '#4a3268'
      ctx.beginPath()
      ctx.moveTo(-10, -36)
      ctx.lineTo(0, -53)
      ctx.lineTo(10, -36)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.fillStyle = light
      ctx.beginPath()
      ctx.arc(0, -54, 3.5, 0, TAU)
      ctx.fill()
      drawGlow(ctx, 0, -54, 14, light, 0.3)
      drawLine(ctx, 10, -26, 17, -4, '#6b4a2a', 2)
      ctx.fillStyle = light
      ctx.beginPath()
      ctx.arc(17, -5, 5, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.stroke()
      drawGlow(ctx, 17, -5, 16, light, 0.35)
      break
    }
    case 'engineer': {
      legs('#5b4a32')
      body(def.color, '#a97a18', 16, 17, -21)
      head('#e8bd8a', 6.5, -31)
      ctx.fillStyle = '#e0b23a'
      ctx.beginPath()
      ctx.arc(0, -34, 8, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#c59120'
      ctx.fillRect(-11, -34, 22, 3)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.strokeRect(-11, -34, 22, 3)
      eye(-30)
      ctx.fillStyle = '#6e6a62'
      fillRound(ctx, -18, -22, 7, 13, 2, '#6e6a62')
      ctx.strokeStyle = '#3d3a33'
      ctx.lineWidth = 1
      ctx.strokeRect(-18, -22, 7, 13)
      drawLine(ctx, 9, -20, 17, -26, '#9aa3a8', 2.5)
      ctx.strokeStyle = '#9aa3a8'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(19, -28, 4, 0, TAU)
      ctx.stroke()
      break
    }
    case 'brute': {
      legs('#5b3b2a')
      body(def.color, '#743b2b', 25, 22, -26)
      head('#d69a6a', 9, -38)
      ctx.fillStyle = '#6b3a25'
      ctx.beginPath()
      ctx.moveTo(-11, -40)
      ctx.lineTo(-14, -52)
      ctx.lineTo(-5, -45)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(11, -40)
      ctx.lineTo(14, -52)
      ctx.lineTo(5, -45)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(-3, -38, 1.2, 0, TAU)
      ctx.arc(3, -38, 1.2, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#6b4525'
      ctx.lineWidth = 6
      drawLine(ctx, 13, -24, 22, -4, '#6b4525', 6)
      ctx.fillStyle = '#8b6a4b'
      ctx.beginPath()
      ctx.arc(23, -4, 7, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
    case 'ranger': {
      legs('#3e4f3b')
      body(def.color, '#23675f', 15, 17, -21)
      head('#e8bd8a', 6.5, -31)
      ctx.fillStyle = '#2f4a3e'
      ctx.beginPath()
      ctx.moveTo(-9, -30)
      ctx.quadraticCurveTo(0, -44, 9, -30)
      ctx.lineTo(4, -27)
      ctx.quadraticCurveTo(0, -36, -4, -27)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.8
      ctx.stroke()
      eye(-30)
      ctx.fillStyle = '#6b4a2a'
      fillRound(ctx, 6, -24, 16, 4, 2, '#6b4a2a')
      ctx.fillStyle = '#4a3a2a'
      ctx.beginPath()
      ctx.moveTo(8, -28)
      ctx.lineTo(16, -20)
      ctx.lineTo(8, -20)
      ctx.closePath()
      ctx.fill()
      drawLine(ctx, 10, -24, 23, -24, '#c8b28b', 1.2)
      break
    }
  }

  const damaged = unit.hp < unit.maxHp
  if (!portrait && damaged) {
    const barW = 24
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    fillRound(ctx, -barW / 2, -58, barW, 4, 2, 'rgba(0,0,0,0.55)')
    const ratio = clamp(unit.hp / unit.maxHp, 0, 1)
    ctx.fillStyle = unit.side === 'player' ? '#7bdc8b' : '#ff8a7c'
    fillRound(ctx, -barW / 2, -58, barW * ratio, 4, 2, unit.side === 'player' ? '#7bdc8b' : '#ff8a7c')
  }
  if (unit.flash > 0) {
    ctx.globalAlpha = unit.flash * 0.5
    ctx.fillStyle = '#fff'
    fillRound(ctx, -15, -48, 30, 48, 10, '#fff')
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawCannon(ctx: CanvasRenderingContext2D, castle: Castle, time: number): void {
  const pos = cannonPosition(castle)
  const accent = sideAccent(castle.side)
  const direction = castle.side === 'player' ? 1 : -1
  const angle = (castle.cannonAngle * Math.PI) / 180
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(0, 8, 30, 7, 0, 0, TAU)
  ctx.fill()

  ctx.fillStyle = WOOD_DARK
  ctx.beginPath()
  ctx.moveTo(-14, 4)
  ctx.lineTo(14, 4)
  ctx.lineTo(20, 30)
  ctx.lineTo(-20, 30)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(-8, 7, 4, 20)
  fillRound(ctx, -30, -7, 60, 19, 6, WOOD)
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  roundRectPath(ctx, -30, -7, 60, 19, 6)
  ctx.stroke()
  ctx.fillStyle = '#5b4a3a'
  fillRound(ctx, -24, -5, 48, 5, 2, '#5b4a3a')
  for (const px of [-20, 20]) {
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(px, 2, 3, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = INK_SOFT
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.save()
  ctx.scale(direction, 1)
  ctx.rotate(-angle)
  const recoil = castle.cannonRecoil * 7
  ctx.translate(-recoil, 0)
  ctx.fillStyle = '#4d4640'
  fillRound(ctx, 4, -11, 38, 15, 5, '#4d4640')
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  roundRectPath(ctx, 4, -11, 38, 15, 5)
  ctx.stroke()
  ctx.fillStyle = '#6a625a'
  fillRound(ctx, 8, -9, 30, 4, 2, '#6a625a')
  ctx.fillStyle = accent.main
  fillRound(ctx, 34, -13, 13, 19, 4, accent.main)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  roundRectPath(ctx, 34, -13, 13, 19, 4)
  ctx.stroke()
  ctx.fillStyle = '#2d2824'
  ctx.beginPath()
  ctx.ellipse(46, -3.5, 4, 8.5, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = GOLD_DEEP
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (castle.cannonFlash > 0) {
    const flash = castle.cannonFlash / 0.16
    drawGlow(ctx, 54, -3, 20 + flash * 16, '#ffe08a', 0.55 * flash)
    ctx.fillStyle = '#fff6cf'
    starPath(ctx, 54, -3, 8 + flash * 7, 7, 0.35)
    ctx.fill()
    ctx.strokeStyle = '#ffc94a'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()

  ctx.fillStyle = accent.main
  ctx.beginPath()
  ctx.moveTo(-16, 4)
  ctx.lineTo(0, -24)
  ctx.lineTo(16, 4)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function drawAimPreview(ctx: CanvasRenderingContext2D, battle: Battle, time: number): void {
  if (battle.phase !== 'fight') return
  const points = battle.preview()
  if (points.length < 2) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 224, 138, 0.46)'
  ctx.lineWidth = 2
  ctx.setLineDash([1, 8])
  ctx.lineDashOffset = -time * 22
  ctx.beginPath()
  const first = points[0]
  if (first) ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i += 2) {
    const point = points[i]
    if (point) ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  for (let i = 4; i < points.length; i += 6) {
    const point = points[i]
    if (!point) continue
    const pulse = 0.7 + Math.sin(time * 5 - i * 0.12) * 0.25
    ctx.globalAlpha = 0.9 * pulse
    const radius = i % 2 === 0 ? 5 : 3.8
    ctx.fillStyle = 'rgba(36, 26, 19, 0.6)'
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius + 1.3, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, TAU)
    ctx.fill()
  }
  const last = points[points.length - 1]
  if (last) {
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = '#ffe08a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(last.x, last.y, 13 + Math.sin(time * 4) * 2, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(last.x - 18, last.y)
    ctx.lineTo(last.x - 8, last.y)
    ctx.moveTo(last.x + 8, last.y)
    ctx.lineTo(last.x + 18, last.y)
    ctx.moveTo(last.x, last.y - 18)
    ctx.lineTo(last.x, last.y - 8)
    ctx.moveTo(last.x, last.y + 8)
    ctx.lineTo(last.x, last.y + 18)
    ctx.stroke()
  }
  ctx.restore()
}

function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, time: number): void {
  ctx.save()
  const arrow = projectile.kind === 'arrow' || projectile.kind === 'bolt'
  const trail = arrow ? projectile.trail.slice(-4) : projectile.trail
  if (trail.length > 1) {
    ctx.globalAlpha = arrow ? 0.15 : projectile.source === 'cannon' ? 0.32 : 0.24
    ctx.strokeStyle = projectile.color
    ctx.lineWidth = arrow ? 1.4 : projectile.kind === 'boulder' || projectile.kind === 'bomb' ? 5 : 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    const first = trail[0]
    if (first) ctx.moveTo(first.x, first.y)
    for (let i = 1; i < trail.length; i += 1) {
      const point = trail[i]
      if (point) ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.translate(projectile.x, projectile.y)
  const angle = Math.atan2(projectile.vy, projectile.vx)
  switch (projectile.kind) {
    case 'arrow':
    case 'bolt': {
      ctx.rotate(angle)
      drawLine(ctx, -9, 0, 8, 0, '#6e4b2a', 2)
      ctx.fillStyle = '#d7e4ef'
      ctx.beginPath()
      ctx.moveTo(10, 0)
      ctx.lineTo(3, -3.5)
      ctx.lineTo(3, 3.5)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#e8d8b7'
      ctx.beginPath()
      ctx.moveTo(-9, 0)
      ctx.lineTo(-14, -3)
      ctx.lineTo(-11, 0)
      ctx.lineTo(-14, 3)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'bomb': {
      ctx.rotate(Math.sin(time * 8) * 0.4)
      ctx.fillStyle = '#2b2320'
      ctx.beginPath()
      ctx.arc(0, 0, 7, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.strokeStyle = '#d9a24f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(4, -6)
      ctx.quadraticCurveTo(9, -14, 12, -10)
      ctx.stroke()
      drawGlow(ctx, 12, -10, 8, '#ffb85c', 0.5)
      break
    }
    case 'orb': {
      drawGlow(ctx, 0, 0, 20, projectile.color, 0.55)
      ctx.fillStyle = projectile.color
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(-2, -2, 2.4, 0, TAU)
      ctx.fill()
      break
    }
    case 'boulder': {
      ctx.rotate(time * 4)
      ctx.fillStyle = '#7a6a59'
      ctx.beginPath()
      for (let i = 0; i < 8; i += 1) {
        const r = 8 + (i % 3) * 1.5
        const a = (i / 8) * TAU
        const px = Math.cos(a) * r
        const py = Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
    case 'cannon':
    default: {
      drawGlow(ctx, 0, 0, 18, projectile.color, 0.24)
      ctx.fillStyle = '#3d3731'
      ctx.beginPath()
      ctx.arc(0, 0, 8, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#fff6cf'
      ctx.beginPath()
      ctx.arc(-2.5, -2.5, 2.5, 0, TAU)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void {
  for (const particle of particles) {
    const life = Math.max(0, particle.life / particle.maxLife)
    ctx.save()
    ctx.globalAlpha = particle.alpha * life
    ctx.translate(particle.x, particle.y)
    ctx.rotate(particle.rotation)
    switch (particle.kind) {
      case 'dust':
      case 'smoke': {
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(0, 0, particle.size * (1.5 - life * 0.5), 0, TAU)
        ctx.fill()
        break
      }
      case 'spark': {
        ctx.strokeStyle = particle.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-particle.vx * 0.02, -particle.vy * 0.02)
        ctx.stroke()
        break
      }
      case 'debris': {
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.moveTo(-particle.size, 0)
        ctx.lineTo(0, -particle.size * 0.8)
        ctx.lineTo(particle.size, 0)
        ctx.lineTo(0, particle.size * 0.7)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = INK
        ctx.lineWidth = 1
        ctx.stroke()
        break
      }
      case 'ember': {
        drawGlow(ctx, 0, 0, particle.size * 3, particle.color, 0.4)
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(0, 0, particle.size * 0.5, 0, TAU)
        ctx.fill()
        break
      }
      case 'ring': {
        ctx.strokeStyle = particle.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, particle.size * (2 - life), 0, TAU)
        ctx.stroke()
        break
      }
      case 'star': {
        ctx.fillStyle = particle.color
        starPath(ctx, 0, 0, particle.size * (0.6 + life), 4, 0.3)
        ctx.fill()
        break
      }
      case 'leaf': {
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.ellipse(0, 0, particle.size, particle.size * 0.45, 0, 0, TAU)
        ctx.fill()
        break
      }
    }
    ctx.restore()
  }
}

export function drawFloatTexts(
  ctx: CanvasRenderingContext2D,
  texts: ReadonlyArray<{ x: number; y: number; text: string; color: string; life: number; maxLife: number; size: number }>,
): void {
  for (const text of texts) {
    const life = Math.max(0, text.life / text.maxLife)
    ctx.save()
    ctx.globalAlpha = Math.min(1, life * 2)
    drawText(ctx, text.text, text.x, text.y, text.size, text.color, 'center', true)
    ctx.restore()
  }
}

function drawSlotTag(
  ctx: CanvasRenderingContext2D,
  castle: Castle,
  module: (typeof MODULES)[number],
  time: number,
  selected: boolean,
  locked: boolean,
): void {
  const x = castle.x + module.col * CELL
  const y = castle.y + module.row * CELL
  ctx.save()
  const pulse = 0.5 + Math.sin(time * 3 + module.col) * 0.18
  ctx.setLineDash([6, 5])
  ctx.lineDashOffset = -time * 14
  ctx.strokeStyle = locked ? 'rgba(255,243,214,0.24)' : selected ? GOLD : `rgba(255,243,214,${0.55 + pulse * 0.2})`
  ctx.lineWidth = selected ? 3.5 : 2
  roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = locked ? 'rgba(10,22,19,0.42)' : 'rgba(255,243,214,0.08)'
  fillRound(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7, locked ? 'rgba(10,22,19,0.42)' : 'rgba(255,243,214,0.08)')
  if (locked) {
    ctx.globalAlpha = 0.7
    drawSmallText(ctx, '🔒', x + CELL / 2, y + CELL / 2 - 5, 16, CREAM)
    drawSmallText(ctx, 'MURO', x + CELL / 2, y + CELL / 2 + 13, 7, 'rgba(255,243,214,0.65)')
  } else {
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(x + CELL / 2 - 12, y + CELL / 2 - 2, 9, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.stroke()
    drawSmallText(ctx, '+', x + CELL / 2 - 12, y + CELL / 2 - 2, 15, INK)
    drawSmallText(ctx, `${module.costWood}`, x + CELL / 2 + 9, y + CELL / 2 - 2, 11, CREAM)
    drawSmallText(ctx, 'MADERA', x + CELL / 2 + 9, y + CELL / 2 + 11, 6.5, 'rgba(255,243,214,0.6)')
  }
  ctx.restore()
}

function drawBuildSlots(
  ctx: CanvasRenderingContext2D,
  castle: Castle,
  time: number,
  options: CastleDrawOptions,
): void {
  const selected = options.selected ?? null
  const tab = options.tab ?? 'build'
  for (const module of MODULES) {
    const cell = moduleCell(castle, module.id)
    const level = cell ? cell.level : 0
    if (level > 0) {
      if (tab === 'upgrade' || options.hover === module.id) {
        const x = castle.x + module.col * CELL
        const y = castle.y + module.row * CELL
        const pulse = 0.5 + Math.sin(time * 4 + module.col) * 0.2
        ctx.save()
        ctx.strokeStyle = options.hover === module.id || selected === module.id ? GOLD : `rgba(255,201,74,${0.35 + pulse * 0.35})`
        ctx.lineWidth = 2.5
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7)
        ctx.stroke()
        if (selected === module.id) {
          ctx.fillStyle = 'rgba(255,201,74,0.1)'
          fillRound(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 7, 'rgba(255,201,74,0.1)')
        }
        ctx.restore()
      }
      continue
    }
    if (tab === 'units') continue
    const supportOk = !module.support || (moduleCell(castle, module.support)?.level ?? 0) > 0
    drawSlotTag(ctx, castle, module, time, selected === module.id || options.hover === module.id, !supportOk)
  }
}

function drawUnitSlots(ctx: CanvasRenderingContext2D, castle: Castle, time: number, selected: ModuleId | null): void {
  for (let index = 0; index < 4; index += 1) {
    const slot = castle.units[index]
    if (slot) {
      if (selected) {
        const rect = { x: slot.x - 24, y: slot.y - 48, w: 48, h: 50 }
        ctx.save()
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2.5
        roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8)
        ctx.stroke()
        ctx.restore()
      }
      continue
    }
    const room = castle.cells.find((cell) => cell.kind === 'room' && !castle.units.some((unit) => unit.cellCol === cell.col && unit.cellRow === cell.row))
    if (!room) continue
    const x = castle.x + (room.col + 0.5) * CELL
    const y = castle.y + (room.row + 0.5) * CELL
    ctx.save()
    ctx.globalAlpha = 0.5 + Math.sin(time * 3 + index) * 0.1
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = CREAM
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    drawSmallText(ctx, '+', x, y, 16, CREAM)
    ctx.restore()
  }
}

export function drawCastle(
  ctx: CanvasRenderingContext2D,
  castle: Castle,
  time: number,
  options: CastleDrawOptions = {},
): void {
  const pivotX = castle.x + CASTLE_W / 2
  const pivotY = castle.y + CASTLE_H
  ctx.save()
  if (options.dim) ctx.globalAlpha = 0.82
  ctx.translate(pivotX, pivotY)
  ctx.rotate(Math.sin(time * 0.9 + (castle.side === 'player' ? 0 : 2)) * 0.004)
  ctx.scale(castle.scale, castle.scale)
  ctx.translate(-pivotX, -pivotY)

  drawPlatform(ctx, castle, time)
  drawCastleBacking(ctx, castle)
  const sorted = [...castle.cells].sort((a, b) => b.row - a.row || a.col - b.col)
  for (const cell of sorted) drawCell(ctx, castle, cell, time)
  for (const unit of castle.units) {
    drawUnit(ctx, unit, time)
  }
  drawCannon(ctx, castle, time)
  if (options.showSlots) {
    drawBuildSlots(ctx, castle, time, options)
    if (options.tab === 'units') drawUnitSlots(ctx, castle, time, options.selected ?? null)
  }
  ctx.restore()
}

export function drawHomeScene(ctx: CanvasRenderingContext2D, time: number, hero: Castle, enemyTower: Castle | null): void {
  drawBackground(ctx, hero.palette, time)
  if (enemyTower) drawCastle(ctx, enemyTower, time, { dim: true })
  drawCastle(ctx, hero, time)
  drawPaperOverlay(ctx)
}

export function drawBuildScene(
  ctx: CanvasRenderingContext2D,
  time: number,
  castle: Castle,
  options: CastleDrawOptions,
): void {
  drawBackground(ctx, castle.palette, time)
  const ground = ctx.createLinearGradient(0, 500, 0, WORLD.h)
  ground.addColorStop(0, castle.palette.ground)
  ground.addColorStop(1, castle.palette.groundDark)
  ctx.fillStyle = ground
  ctx.beginPath()
  ctx.moveTo(0, 510)
  for (let x = 0; x <= WORLD.w; x += 60) ctx.lineTo(x, 505 + Math.sin(x * 0.015) * 12)
  ctx.lineTo(WORLD.w, WORLD.h)
  ctx.lineTo(0, WORLD.h)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.setLineDash([8, 8])
  roundRectPath(ctx, castle.x - 78, castle.y - 84, CASTLE_W * castle.scale + 156, CASTLE_H * castle.scale + 190, 26)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
  drawCastle(ctx, castle, time, options)
  drawPaperOverlay(ctx)
}

function drawIntro(ctx: CanvasRenderingContext2D, battle: Battle, time: number): void {
  if (battle.phase !== 'intro') return
  const t = clamp(battle.introTime / 1.45, 0, 1)
  const alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28
  ctx.save()
  ctx.globalAlpha = 0.62
  ctx.fillStyle = '#071312'
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)
  ctx.globalAlpha = alpha
  const slide = (1 - Math.min(1, t * 3.4)) * 200
  ctx.fillStyle = sideAccent('player').dark
  ctx.beginPath()
  ctx.moveTo(-100, 208)
  ctx.lineTo(560 + slide, 208)
  ctx.lineTo(500 + slide, 420)
  ctx.lineTo(-100, 420)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = sideAccent('enemy').dark
  ctx.beginPath()
  ctx.moveTo(WORLD.w + 100, 208)
  ctx.lineTo(WORLD.w - 560 - slide, 208)
  ctx.lineTo(WORLD.w - 500 - slide, 420)
  ctx.lineTo(WORLD.w + 100, 420)
  ctx.closePath()
  ctx.fill()
  drawText(ctx, battle.player.name, 250 - slide * 0.4, 302, 38, CREAM)
  drawText(ctx, battle.enemy.name, WORLD.w - 250 + slide * 0.4, 302, 38, CREAM)
  drawSmallText(ctx, `${battle.player.trophies} COPAS`, 250 - slide * 0.4, 340, 13, GOLD)
  drawSmallText(ctx, `${battle.enemy.trophies} COPAS`, WORLD.w - 250 + slide * 0.4, 340, 13, GOLD)
  const scale = 0.85 + Math.sin(clamp(t * 5, 0, 1) * Math.PI) * 0.2
  ctx.translate(WORLD.w / 2, 315)
  ctx.scale(scale, scale)
  drawText(ctx, 'VS', 0, 0, 94, GOLD)
  ctx.restore()
}

export function drawBattleScene(ctx: CanvasRenderingContext2D, time: number, battle: Battle): void {
  drawBackground(ctx, battle.arena.palette, time)
  drawCastle(ctx, battle.player, time)
  drawCastle(ctx, battle.enemy, time)
  drawAimPreview(ctx, battle, time)
  for (const projectile of battle.projectiles) drawProjectile(ctx, projectile, time)
  drawIntro(ctx, battle, time)
  drawPaperOverlay(ctx)
}

export function drawResultOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.fillStyle = 'rgba(5,15,14,0.54)'
  ctx.fillRect(0, 0, WORLD.w, WORLD.h)
  ctx.restore()
}

export function drawUnitPortrait(kind: UnitId, side: Side): string {
  const cache = portraitCache
  const key = `${side}:${kind}`
  const cached = cache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 72
  canvas.height = 88
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(1.05, 1.05)
  const fake: Unit = {
    id: key,
    side,
    kind,
    x: 34,
    y: 80,
    hp: 100,
    maxHp: 100,
    level: 1,
    cooldown: 0,
    attackTimer: 0,
    bob: 0,
    flash: 0,
    dead: false,
    cellCol: 0,
    cellRow: 0,
    recoil: 0,
  }
  drawUnit(ctx, fake, 0, true)
  const url = canvas.toDataURL('image/png')
  cache.set(key, url)
  return url
}

const portraitCache = new Map<string, string>()

export function drawModuleIcon(ctx: CanvasRenderingContext2D, module: ModuleId, x: number, y: number, size: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 52, size / 52)
  const cell: Cell = {
    col: 0,
    row: 0,
    kind: module === 'towerL' || module === 'towerR' ? 'tower' : module === 'roof' ? 'roof' : module === 'baseL' || module === 'baseR' ? 'base' : 'wall',
    moduleId: module,
    level: 1,
    hp: 100,
    maxHp: 100,
    maxHpBase: 100,
    falling: false,
    fallY: 0,
    fallVy: 0,
    fallRotation: 0,
    flash: 0,
    hitFlash: 0,
  }
  const fakeCastle: Castle = {
    side: 'player',
    x: 0,
    y: 0,
    scale: 1,
    cells: [cell],
    units: [],
    core: cell,
    cannonAngle: 45,
    cannonRecoil: 0,
    cannonFlash: 0,
    name: '',
    trophies: 0,
    palette: {} as Palette,
  }
  drawCell(ctx, fakeCastle, cell, 0)
  ctx.restore()
}

export function drawEventBurst(ctx: CanvasRenderingContext2D, event: CastleEvent): void {
  if (event.type !== 'destroy' && event.type !== 'land') return
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(event.x, event.y, 18, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function drawCoreHealth(ctx: CanvasRenderingContext2D, castle: Castle): void {
  if (castle.core.hp >= castle.core.maxHp) return
  const x = castle.x + CASTLE_W / 2
  const y = castle.y - 70
  const ratio = clamp(coreHpPercent(castle) / 100, 0, 1)
  ctx.save()
  fillRound(ctx, x - 55, y, 110, 10, 5, 'rgba(0,0,0,0.5)')
  fillRound(ctx, x - 53, y + 2, 106 * ratio, 6, 3, sideAccent(castle.side).main)
  ctx.restore()
}

export function drawSlotHighlight(
  ctx: CanvasRenderingContext2D,
  castle: Castle,
  module: ModuleId,
  color: string,
): void {
  const def = MODULES.find((entry) => entry.id === module)
  if (!def) return
  const x = castle.x + def.col * CELL
  const y = castle.y + def.row * CELL
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.setLineDash([4, 4])
  roundRectPath(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 7)
  ctx.stroke()
  ctx.restore()
}

export function drawBuildBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  drawSmallText(ctx, text, x, y, 11, CREAM)
}

export function drawUnitLabel(ctx: CanvasRenderingContext2D, unit: Unit): void {
  if (unit.dead) return
  drawSmallText(ctx, UNIT_BY_ID[unit.kind].name.toUpperCase(), unit.x, unit.y - 65, 7, 'rgba(255,243,214,0.6)')
}

export function drawArenaName(ctx: CanvasRenderingContext2D, palette: Palette, name: string): void {
  ctx.save()
  ctx.globalAlpha = 0.16
  drawText(ctx, name, WORLD.w / 2, 112, 30, palette.accent)
  ctx.restore()
}

export function drawCoreMarker(ctx: CanvasRenderingContext2D, castle: Castle, time: number): void {
  const cell = castle.core
  if (cell.hp <= 0) return
  const x = castle.x + (CORE_CELL.col + 0.5) * CELL
  const y = castle.y + CORE_CELL.row * CELL - 8
  ctx.save()
  ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2
  ctx.strokeStyle = sideAccent(castle.side).light
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y + 26, 22, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

export function drawCastleCaption(ctx: CanvasRenderingContext2D, castle: Castle): void {
  const accent = sideAccent(castle.side)
  ctx.save()
  ctx.globalAlpha = 0.8
  drawSmallText(ctx, castle.name.toUpperCase(), castle.x + CASTLE_W / 2, castle.y + CASTLE_H + 66, 10, accent.light)
  ctx.restore()
}
