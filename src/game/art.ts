import {
  CASTLE_H,
  CASTLE_W,
  CELL,
  CORE_CELL,
  MODULES,
  MODULE_BY_ID,
  PALETTES,
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
import { drawDetailedBackground } from './detail.ts'
import type {
  ArenaId,
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

export function drawBackground(ctx: CanvasRenderingContext2D, palette: Palette, time: number, arena: ArenaId = 'dusk'): void {
  drawDetailedBackground(ctx, palette, time, arena)
}


function seeded(col: number, row: number, salt = 0): () => number {
  return mulberry32(col * 131 + row * 977 + salt * 37 + 17)
}

function nail(ctx: CanvasRenderingContext2D, x: number, y: number, r = 1.6): void {
  ctx.fillStyle = '#4a4038'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.34, 0, TAU)
  ctx.fill()
}

function ironBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical = false): void {
  ctx.save()
  const grad = ctx.createLinearGradient(x, y, vertical ? x + w : x, vertical ? y : y + h)
  grad.addColorStop(0, '#5a5148')
  grad.addColorStop(0.45, '#8b8174')
  grad.addColorStop(0.55, '#514941')
  grad.addColorStop(1, '#2f2a26')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(20,16,13,0.8)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  if (vertical) {
    for (let yy = y + 5; yy < y + h - 2; yy += 9) nail(ctx, x + w / 2, yy, 1.3)
  } else {
    for (let xx = x + 5; xx < x + w - 2; xx += 9) nail(ctx, xx, y + h / 2, 1.3)
  }
  ctx.restore()
}

function woodPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seedValue: number,
  vertical = false,
  dark = false,
): void {
  const random = mulberry32(seedValue)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const grad = vertical
    ? ctx.createLinearGradient(x, y, x + w, y)
    : ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, dark ? '#6c3d20' : '#b97540')
  grad.addColorStop(0.45, dark ? '#7e4a27' : '#a45f31')
  grad.addColorStop(1, dark ? '#4d2a16' : '#7d4423')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = dark ? 'rgba(32,17,9,0.42)' : 'rgba(74,40,20,0.3)'
  ctx.lineWidth = 1
  const lines = Math.max(3, Math.floor((vertical ? w : h) / 5))
  for (let i = 0; i < lines; i += 1) {
    const offset = random() * 3
    ctx.beginPath()
    if (vertical) {
      const px = x + 2 + (i * (w - 4)) / lines + offset
      ctx.moveTo(px, y)
      ctx.bezierCurveTo(px + 2, y + h * 0.3, px - 2, y + h * 0.7, px + 1, y + h)
    } else {
      const py = y + 2 + (i * (h - 4)) / lines + offset
      ctx.moveTo(x, py)
      ctx.bezierCurveTo(x + w * 0.3, py + 1, x + w * 0.7, py - 1, x + w, py + 1)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 2; i += 1) {
    const kx = x + 6 + random() * Math.max(2, w - 12)
    const ky = y + 6 + random() * Math.max(2, h - 12)
    ctx.strokeStyle = 'rgba(55,29,14,0.35)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(kx, ky, 2.5 + random() * 2, 1.3, random() * 3, 0, TAU)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,241,201,0.07)'
  ctx.fillRect(x, y, vertical ? 3 : w, vertical ? h : 2)
  ctx.restore()
}

function drawCastleEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-7, 4)
  ctx.lineTo(-7, -2)
  ctx.lineTo(-3, -2)
  ctx.lineTo(-3, -7)
  ctx.lineTo(1, -7)
  ctx.lineTo(1, -2)
  ctx.lineTo(5, -2)
  ctx.lineTo(5, -8)
  ctx.lineTo(9, -8)
  ctx.lineTo(9, 4)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(36,26,19,0.5)'
  ctx.fillRect(-2.5, -1, 2, 5)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-1, -11)
  ctx.lineTo(3, -15)
  ctx.lineTo(7, -11)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  trim: string,
  time: number,
  emblem = true,
): void {
  const wave = Math.sin(time * 1.4 + x * 0.02) * 2
  ctx.save()
  ctx.fillStyle = '#3b2a1d'
  ctx.fillRect(x - 2, y - 2, w + 4, 3)
  nail(ctx, x + 1, y - 1, 1.2)
  nail(ctx, x + w - 1, y - 1, 1.2)
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, color)
  grad.addColorStop(0.55, trim)
  grad.addColorStop(1, color)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w + wave * 0.4, y + h * 0.55)
  ctx.lineTo(x + w * 0.72, y + h * 0.48)
  ctx.lineTo(x + w * 0.52, y + h)
  ctx.lineTo(x + w * 0.28, y + h * 0.5)
  ctx.lineTo(x, y + h * 0.58)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(36,26,19,0.45)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.moveTo(x + 2, y + 2)
  ctx.lineTo(x + w * 0.35, y + 2)
  ctx.lineTo(x + w * 0.2, y + h * 0.5)
  ctx.lineTo(x + 2, y + h * 0.5)
  ctx.closePath()
  ctx.fill()
  if (emblem) drawCastleEmblem(ctx, x + w / 2, y + h * 0.38, Math.min(0.8, w / 20), 'rgba(255,243,214,0.78)')
  ctx.restore()
}

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, scale = 1): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = '#3d2a1b'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.lineTo(0, 12)
  ctx.stroke()
  ctx.fillStyle = '#6d4b2b'
  ctx.fillRect(-4, -1, 8, 5)
  ctx.strokeStyle = '#3d2a1b'
  ctx.lineWidth = 1
  ctx.strokeRect(-4, -1, 8, 5)
  const flicker = Math.sin(time * 12 + x) * 1.5
  drawGlow(ctx, 0, -8, 25, '#ffb85c', 0.35)
  ctx.fillStyle = '#ff9b3e'
  ctx.beginPath()
  ctx.moveTo(-5, -1)
  ctx.quadraticCurveTo(-7 + flicker, -12, 0, -18 - flicker)
  ctx.quadraticCurveTo(7 + flicker, -11, 5, -1)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.moveTo(-2.6, -2)
  ctx.quadraticCurveTo(-2 + flicker, -9, 0, -12)
  ctx.quadraticCurveTo(3 + flicker, -8, 2.6, -2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, scale = 1): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.strokeStyle = '#3d2a1b'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(0, -4)
  ctx.lineTo(0, 1)
  ctx.stroke()
  fillRound(ctx, -5, 1, 10, 12, 3, '#4d3b2c')
  const glow = 0.55 + Math.sin(time * 7 + x) * 0.15
  drawGlow(ctx, 0, 7, 22, '#ffd36e', glow * 0.45)
  fillRound(ctx, -3.6, 2.6, 7.2, 8.8, 2, '#ffe08a')
  ctx.strokeStyle = '#2b2119'
  ctx.lineWidth = 1
  roundRectPath(ctx, -5, 1, 10, 12, 3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, 1)
  ctx.lineTo(0, 13)
  ctx.moveTo(-5, 7)
  ctx.lineTo(5, 7)
  ctx.stroke()
  ctx.restore()
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const grad = ctx.createLinearGradient(-8, 0, 8, 0)
  grad.addColorStop(0, '#6f3f21')
  grad.addColorStop(0.5, '#a86a37')
  grad.addColorStop(1, '#5a3019')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(-8, -15)
  ctx.quadraticCurveTo(-11, -7, -8, 0)
  ctx.lineTo(8, 0)
  ctx.quadraticCurveTo(11, -7, 8, -15)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#2f1b10'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.strokeStyle = '#3d4244'
  ctx.lineWidth = 2
  for (const yy of [-12, -7, -2]) {
    ctx.beginPath()
    ctx.ellipse(0, yy, 8.5, 2, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,240,190,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-4, -13)
  ctx.lineTo(-5, -2)
  ctx.stroke()
  ctx.restore()
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  woodPanel(ctx, -9, -13, 18, 13, 77, false, false)
  ctx.strokeStyle = '#3e2614'
  ctx.lineWidth = 1.5
  ctx.strokeRect(-9, -13, 18, 13)
  ctx.beginPath()
  ctx.moveTo(-9, -13)
  ctx.lineTo(9, 0)
  ctx.moveTo(9, -13)
  ctx.lineTo(-9, 0)
  ctx.stroke()
  nail(ctx, -7, -11, 1)
  nail(ctx, 7, -2, 1)
  ctx.restore()
}

function drawSack(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#b99763'
  ctx.beginPath()
  ctx.moveTo(-7, 0)
  ctx.quadraticCurveTo(-10, -10, -4, -14)
  ctx.lineTo(4, -14)
  ctx.quadraticCurveTo(10, -10, 7, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#5f4b2e'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = '#6d522f'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-4, -13)
  ctx.lineTo(4, -13)
  ctx.stroke()
  ctx.restore()
}

function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, trim: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const grad = ctx.createLinearGradient(0, -10, 0, 10)
  grad.addColorStop(0, trim)
  grad.addColorStop(1, color)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(-9, -10)
  ctx.quadraticCurveTo(0, -14, 9, -10)
  ctx.lineTo(8, 2)
  ctx.quadraticCurveTo(0, 12, -8, 2)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#2e251d'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,243,214,0.65)'
  ctx.fillRect(-1, -9, 2, 16)
  ctx.fillRect(-6, -3, 12, 2)
  nail(ctx, -5, -7, 1)
  nail(ctx, 5, -7, 1)
  ctx.restore()
}

function drawChain(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, count = 6): void {
  ctx.save()
  ctx.strokeStyle = '#5b5246'
  ctx.lineWidth = 1.3
  for (let i = 0; i < count; i += 1) {
    const t = i / count
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * 3
    ctx.beginPath()
    ctx.ellipse(x, y, 2.5, 1.3, t * Math.PI, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

function drawIvy(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, time: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.bezierCurveTo(x - 4, y + h * 0.3, x + 5, y + h * 0.6, x + Math.sin(time * 0.8) * 2, y + h)
  ctx.stroke()
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5
    const px = x + Math.sin(t * 8 + time) * 3
    const py = y + h * t
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(px, py, 2.4, 1.4, t * 2, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawArrowSlit(ctx: CanvasRenderingContext2D, x: number, y: number, w = 8, h = 18): void {
  ctx.save()
  ctx.fillStyle = '#171310'
  fillRound(ctx, x - w / 2, y - h / 2, w, h, 3, '#171310')
  ctx.strokeStyle = 'rgba(255,243,214,0.18)'
  ctx.lineWidth = 1
  roundRectPath(ctx, x - w / 2, y - h / 2, w, h, 3)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,214,150,0.18)'
  ctx.fillRect(x - 1, y - h / 2 + 2, 1.5, h - 4)
  ctx.restore()
}

function drawCobweb(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(255,243,214,0.55)'
  ctx.lineWidth = 0.6
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * (Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(x, y, size * 0.45, 0, Math.PI / 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, size * 0.72, 0, Math.PI / 2)
  ctx.stroke()
  ctx.restore()
}

function drawCannonballPile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  for (const ball of [
    { x: -6, y: -4, r: 4.5 },
    { x: 4, y: -4, r: 4.5 },
    { x: -1, y: -11, r: 4.5 },
  ]) {
    const grad = ctx.createRadialGradient(ball.x - 1.5, ball.y - 1.5, 0.5, ball.x, ball.y, ball.r)
    grad.addColorStop(0, '#7a7268')
    grad.addColorStop(1, '#211d1a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#151210'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

function drawPowderKeg(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  drawBarrel(ctx, x, y, s * 0.72)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#2b2119'
  ctx.font = '700 5px "Nunito", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('PÓLVORA', 0, -7)
  ctx.restore()
}

function drawWheelDetailed(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#2b2522'
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#171310'
  ctx.lineWidth = 3
  ctx.stroke()
  const rim = ctx.createLinearGradient(-radius, -radius, radius, radius)
  rim.addColorStop(0, '#b87a3b')
  rim.addColorStop(0.5, '#e0a45a')
  rim.addColorStop(1, '#754521')
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.82, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = 'rgba(36,26,19,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.7, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = '#4a2d17'
  ctx.lineWidth = 2
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + time * 0.05
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * radius * 0.18, Math.sin(a) * radius * 0.18)
    ctx.lineTo(Math.cos(a) * radius * 0.68, Math.sin(a) * radius * 0.68)
    ctx.stroke()
  }
  ctx.fillStyle = '#5e3b1e'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.28, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#2b1b0e'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#f4c469'
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.12, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#2b1b0e'
  ctx.lineWidth = 1
  ctx.stroke()
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.2
    nail(ctx, Math.cos(a) * radius * 0.74, Math.sin(a) * radius * 0.74, 1.1)
  }
  ctx.restore()
}

function drawMudFlap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = '#4b2a17'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w - 3, y + h)
  ctx.lineTo(x + 3, y + h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#2b180d'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,243,214,0.18)'
  ctx.fillRect(x + 3, y + 2, w - 6, 1)
  ctx.restore()
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  drawWheelDetailed(ctx, x, y, radius, 0)
}

function drawPlatform(ctx: CanvasRenderingContext2D, castle: Castle, time: number): void {
  const x = castle.x - 24
  const y = castle.y + CASTLE_H - 10
  const w = CASTLE_W + 48
  const h = 56
  const accent = sideAccent(castle.side)
  const random = seeded(castle.side === 'player' ? 3 : 19, 7, 2)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(castle.x + CASTLE_W / 2, y + h + 48, w * 0.5, 15, 0, 0, TAU)
  ctx.fill()

  // Undercarriage and suspension.
  ctx.strokeStyle = '#3a2415'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(x + 22, y + h + 8)
  ctx.lineTo(x + w - 22, y + h + 8)
  ctx.stroke()
  ctx.strokeStyle = '#7b5740'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 22, y + h + 6)
  ctx.lineTo(x + w - 22, y + h + 6)
  ctx.stroke()
  for (const wheelX of [x + 39, x + w / 2, x + w - 39]) {
    drawWheelDetailed(ctx, wheelX, y + h + 26, wheelX === x + w / 2 ? 28 : 24, time)
    ctx.strokeStyle = '#4e3a2a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(wheelX, y + h + 26, 14, Math.PI * 1.05, Math.PI * 1.6)
    ctx.stroke()
    ctx.fillStyle = '#2f2118'
    ctx.beginPath()
    ctx.arc(wheelX, y + h + 26, 5, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#b37a3f'
    ctx.beginPath()
    ctx.arc(wheelX, y + h + 26, 2.4, 0, TAU)
    ctx.fill()
  }

  // Main deck.
  fillRound(ctx, x, y, w, h, 12, '#5c341d')
  woodPanel(ctx, x + 3, y + 3, w - 6, h - 6, 41 + (castle.side === 'enemy' ? 3 : 0), false, false)
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  roundRectPath(ctx, x, y, w, h, 12)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,246,220,0.15)'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x + 5, y + 5, w - 10, h - 10, 9)
  ctx.stroke()

  // Individual planks and seams.
  ctx.strokeStyle = 'rgba(55,28,14,0.45)'
  ctx.lineWidth = 1
  for (let i = 1; i < 9; i += 1) {
    const px = x + 7 + (i * (w - 14)) / 9
    drawLine(ctx, px, y + 6, px + 1, y + h - 6, 'rgba(55,28,14,0.35)', 1)
  }
  for (let i = 0; i < 12; i += 1) {
    nail(ctx, x + 10 + random() * (w - 20), y + 9 + random() * (h - 18), 1.2)
  }

  // Iron straps and corner brackets.
  ironBand(ctx, x + 4, y + h - 15, w - 8, 7)
  ironBand(ctx, x + 4, y + 6, w - 8, 4)
  for (const bx of [x + 9, x + w - 26]) {
    ctx.save()
    ctx.translate(bx, y + h - 12)
    ctx.strokeStyle = '#5d5348'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(20, 0)
    ctx.stroke()
    ctx.strokeStyle = '#2f2a26'
    ctx.lineWidth = 2
    ctx.stroke()
    nail(ctx, 3, 0, 1.4)
    nail(ctx, 17, 0, 1.4)
    ctx.restore()
  }

  // Side skirt with a team shield and a name ribbon.
  fillRound(ctx, x + w / 2 - 58, y + h - 30, 116, 18, 5, '#2b1d14')
  ctx.strokeStyle = accent.main
  ctx.lineWidth = 1.6
  roundRectPath(ctx, x + w / 2 - 56, y + h - 28, 112, 14, 4)
  ctx.stroke()
  drawSmallText(ctx, castle.side === 'player' ? 'TU FORTALEZA' : 'RIVAL', x + w / 2, y + h - 21, 7.5, CREAM)
  drawShield(ctx, x + 30, y + h - 24, 0.46, accent.dark, accent.main)
  drawShield(ctx, x + w - 30, y + h - 24, 0.46, accent.dark, accent.main)

  // Cargo and little lived-in details on the deck edges.
  drawBarrel(ctx, x + 18, y + 8, 0.74)
  drawCrate(ctx, x + w - 25, y + 7, 0.72)
  drawSack(ctx, x + 39, y + 8, 0.66)
  drawSack(ctx, x + w - 47, y + 9, 0.55)
  drawChain(ctx, x + 12, y + 10, x + 12, y + h - 18, 4)
  drawChain(ctx, x + w - 12, y + 10, x + w - 12, y + h - 18, 4)
  drawLantern(ctx, x + 8, y + 18, time, 0.7)
  drawLantern(ctx, x + w - 8, y + 18, time, 0.7)

  // Small pennants from the deck lip.
  drawBanner(ctx, x + 8, y + h - 2, 10, 15, accent.dark, accent.main, time, false)
  drawBanner(ctx, x + w - 18, y + h - 2, 10, 15, accent.dark, accent.main, time, false)
  ctx.restore()
}

function drawStoneCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  damage: number,
  seedValue = 1,
): void {
  const random = mulberry32(seedValue * 97 + 13)
  ctx.save()
  roundRectPath(ctx, x, y, w, h, 4)
  ctx.clip()
  const baseGrad = ctx.createLinearGradient(x, y, x, y + h)
  baseGrad.addColorStop(0, '#d8cbb2')
  baseGrad.addColorStop(0.5, '#c3b49b')
  baseGrad.addColorStop(1, '#94826b')
  ctx.fillStyle = baseGrad
  ctx.fillRect(x, y, w, h)

  const rows = 4
  const gap = 1.5
  const rowH = (h - 4) / rows
  for (let row = 0; row < rows; row += 1) {
    const ry = y + 2 + row * rowH
    const offset = row % 2 === 0 ? 0 : 5
    let bx = x - offset
    while (bx < x + w) {
      const bw = 9 + random() * 13
      const bwClamped = Math.min(bw, x + w - bx + 1)
      if (bwClamped < 3) break
      const tone = random()
      const blockGrad = ctx.createLinearGradient(0, ry, 0, ry + rowH - gap)
      if (tone > 0.55) {
        blockGrad.addColorStop(0, '#e5d8c0')
        blockGrad.addColorStop(1, '#ad9b82')
      } else if (tone > 0.22) {
        blockGrad.addColorStop(0, '#d2c4aa')
        blockGrad.addColorStop(1, '#9d8a72')
      } else {
        blockGrad.addColorStop(0, '#c1b198')
        blockGrad.addColorStop(1, '#88765f')
      }
      ctx.fillStyle = blockGrad
      roundRectPath(ctx, bx, ry, bwClamped - 1.2, rowH - gap, 1.5)
      ctx.fill()
      ctx.strokeStyle = 'rgba(64,49,35,0.35)'
      ctx.lineWidth = 0.8
      roundRectPath(ctx, bx, ry, bwClamped - 1.2, rowH - gap, 1.5)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,250,236,0.16)'
      ctx.fillRect(bx + 1, ry + 1, bwClamped - 3, 1)
      ctx.fillStyle = 'rgba(38,28,20,0.12)'
      ctx.fillRect(bx + 1, ry + rowH - gap - 2, bwClamped - 3, 1)
      if (random() < 0.18) {
        ctx.fillStyle = 'rgba(58,44,31,0.22)'
        ctx.beginPath()
        ctx.arc(bx + random() * bwClamped, ry + rowH * 0.5, 0.8, 0, TAU)
        ctx.fill()
      }
      bx += bwClamped
    }
    ctx.strokeStyle = 'rgba(69,52,37,0.28)'
    ctx.lineWidth = 1
    drawLine(ctx, x, ry + rowH - gap, x + w, ry + rowH - gap, 'rgba(69,52,37,0.28)', 0.8)
  }

  // Chipped corner and a soft top-edge highlight.
  ctx.fillStyle = 'rgba(52,39,27,0.16)'
  ctx.beginPath()
  ctx.moveTo(x, y + 7)
  ctx.lineTo(x + 5, y)
  ctx.lineTo(x + 10, y)
  ctx.lineTo(x, y + 15)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,250,236,0.14)'
  ctx.fillRect(x + 4, y + 3, w - 8, 1.5)

  // Moss gathering at the foot of some stones.
  if (random() > 0.42) {
    ctx.fillStyle = 'rgba(74,107,56,0.38)'
    for (let i = 0; i < 5; i += 1) {
      const mx = x + random() * w
      const my = y + h - 3 - random() * 3
      ctx.beginPath()
      ctx.ellipse(mx, my, 2 + random() * 3, 1.2, random() * 1.4, 0, TAU)
      ctx.fill()
    }
  }

  if (damage > 0.22) {
    ctx.strokeStyle = 'rgba(38,27,19,0.62)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + w * 0.18, y + 4)
    ctx.lineTo(x + w * 0.32, y + h * 0.38)
    ctx.lineTo(x + w * 0.25, y + h * 0.72)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + w * 0.58, y + 3)
    ctx.lineTo(x + w * 0.5, y + h * 0.33)
    ctx.lineTo(x + w * 0.69, y + h * 0.58)
    ctx.stroke()
  }
  if (damage > 0.56) {
    ctx.fillStyle = 'rgba(27,20,15,0.48)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.56, y + h * 0.54)
    ctx.lineTo(x + w * 0.8, y + h * 0.38)
    ctx.lineTo(x + w * 0.88, y + h * 0.58)
    ctx.lineTo(x + w * 0.7, y + h * 0.85)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(27,20,15,0.6)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = 'rgba(205,190,165,0.5)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.7, y + h * 0.84)
    ctx.lineTo(x + w * 0.78, y + h * 0.65)
    ctx.lineTo(x + w * 0.84, y + h * 0.84)
    ctx.closePath()
    ctx.fill()
  }

  // Warm accent line and mortar grime near the bottom.
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.25
  ctx.fillRect(x + 5, y + h - 6, w - 10, 1.5)
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(40,28,19,0.13)'
  ctx.fillRect(x, y + h - 4, w, 4)
  ctx.restore()
  strokeRound(ctx, x, y, w, h, 4, INK, 2.8)
  ctx.save()
  ctx.strokeStyle = 'rgba(255,243,214,0.1)'
  ctx.lineWidth = 1
  roundRectPath(ctx, x + 2.4, y + 2.4, w - 4.8, h - 4.8, 3)
  ctx.stroke()
  ctx.restore()
}

function drawTower(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  const random = seeded(cell.col, cell.row, 5)
  drawStoneCell(ctx, x + 4, y + 15, w - 8, h - 15, accent.main, damage, cell.col * 31 + cell.row * 17 + 3)

  // Battlements.
  for (let i = 0; i < 3; i += 1) {
    const mx = x + 3 + i * ((w - 6) / 3)
    fillRound(ctx, mx, y + 8, (w - 10) / 3, 11, 2, STONE_LIGHT)
    strokeRound(ctx, mx, y + 8, (w - 10) / 3, 11, 2, INK, 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(mx + 2, y + 10, (w - 14) / 3, 1.5)
  }
  // Quoins.
  for (let i = 0; i < 3; i += 1) {
    const qy = y + 22 + i * 9
    ctx.fillStyle = i % 2 === 0 ? STONE_LIGHT : STONE
    fillRound(ctx, x + 4, qy, 7, 6, 1, i % 2 === 0 ? STONE_LIGHT : STONE)
    strokeRound(ctx, x + 4, qy, 7, 6, 1, 'rgba(36,26,19,0.5)', 1)
    fillRound(ctx, x + w - 11, qy, 7, 6, 1, i % 2 === 0 ? STONE : STONE_LIGHT)
    strokeRound(ctx, x + w - 11, qy, 7, 6, 1, 'rgba(36,26,19,0.5)', 1)
  }
  drawArrowSlit(ctx, x + w / 2, y + h * 0.58)
  drawTorch(ctx, x + 11, y + 34, 0, 0.55)
  drawIvy(ctx, x + w - 9, y + 24, 24, 0, 'rgba(70,106,54,0.6)')

  // Conical tiled roof.
  ctx.save()
  const roofGrad = ctx.createLinearGradient(0, y - 28, 0, y + 12)
  roofGrad.addColorStop(0, accent.light)
  roofGrad.addColorStop(0.45, accent.main)
  roofGrad.addColorStop(1, accent.dark)
  ctx.fillStyle = roofGrad
  ctx.beginPath()
  ctx.moveTo(x - 6, y + 10)
  ctx.quadraticCurveTo(x + 3, y + 8, x + w / 2, y - 32)
  ctx.quadraticCurveTo(x + w - 3, y + 8, x + w + 6, y + 10)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
  // Tiles.
  for (let row = 0; row < 4; row += 1) {
    const ty = y - 20 + row * 7
    const spread = 4 + row * 5
    ctx.strokeStyle = 'rgba(22,18,16,0.25)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath()
      ctx.arc(x + w / 2 - spread + (i * spread) / 2, ty, 4, 0, Math.PI)
      ctx.stroke()
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.moveTo(x + w / 2, y - 32)
  ctx.lineTo(x + w / 2 - 9, y + 7)
  ctx.lineTo(x + w / 2 - 2, y + 7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Flagpole, streaming pennant and finial.
  const poleTop = y - 66
  drawLine(ctx, x + w / 2, y - 30, x + w / 2, poleTop, INK, 2.5)
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(x + w / 2, poleTop, 2.6, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 1
  ctx.stroke()
  drawBanner(ctx, x + w / 2 + 1, poleTop + 4, 22, 16, accent.light, accent.main, castle.x * 0.01 + cell.row, true)
  ctx.fillStyle = 'rgba(36,26,19,0.2)'
  ctx.fillRect(x + 3, y + h - 8, w - 6, 4)
}

function drawRoof(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  drawStoneCell(ctx, x + 2, y + 26, w - 4, h - 26, accent.main, damage, cell.col * 41 + 9)

  // Crenellated stone base.
  for (let i = 0; i < 4; i += 1) {
    const mx = x + 3 + i * ((w - 6) / 4)
    fillRound(ctx, mx, y + 25, (w - 12) / 4, 10, 1.5, STONE_LIGHT)
    strokeRound(ctx, mx, y + 25, (w - 12) / 4, 10, 1.5, INK, 2)
  }

  // Shingled roof body.
  ctx.save()
  const grad = ctx.createLinearGradient(0, y - 28, 0, y + 30)
  grad.addColorStop(0, accent.light)
  grad.addColorStop(0.45, accent.main)
  grad.addColorStop(1, accent.dark)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x - 10, y + 31)
  ctx.quadraticCurveTo(x + 13, y + 10, x + w / 2, y - 29)
  ctx.quadraticCurveTo(x + w - 13, y + 10, x + w + 10, y + 31)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.13)'
  ctx.beginPath()
  ctx.moveTo(x + w / 2, y - 29)
  ctx.lineTo(x + w / 2 - 19, y + 26)
  ctx.lineTo(x + w / 2 - 2, y + 26)
  ctx.closePath()
  ctx.fill()
  // Scalloped tile rows.
  for (let row = 0; row < 4; row += 1) {
    const ty = y - 15 + row * 9
    const spread = 5 + row * 7
    ctx.strokeStyle = 'rgba(20,16,14,0.28)'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i += 1) {
      const tx = x + w / 2 - spread + (i * spread * 2) / 4
      ctx.beginPath()
      ctx.arc(tx, ty, 4.4, 0, Math.PI)
      ctx.stroke()
    }
  }
  ctx.restore()

  // Ridge cap, finial and weather vane.
  ctx.strokeStyle = GOLD_DEEP
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 13, y + 13)
  ctx.quadraticCurveTo(x + w / 2, y - 31, x + w - 13, y + 13)
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(x + w / 2, y - 35, 3, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.2
  ctx.stroke()
  drawLine(ctx, x + w / 2, y - 35, x + w / 2, y - 52, INK, 1.8)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + w / 2 - 7, y - 49)
  ctx.lineTo(x + w / 2 + 7, y - 49)
  ctx.moveTo(x + w / 2 + 3, y - 49)
  ctx.lineTo(x + w / 2 + 7, y - 53)
  ctx.lineTo(x + w / 2 + 7, y - 45)
  ctx.stroke()

  // Banner across the face of the keep.
  drawBanner(ctx, x + w / 2 - 15, y + 32, 30, 14, accent.dark, accent.main, castle.x * 0.01, true)
  drawIvy(ctx, x + 8, y + 35, 17, castle.x * 0.01, 'rgba(70,106,54,0.55)')
  if (damage > 0.3) {
    ctx.strokeStyle = 'rgba(32,23,16,0.6)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + 16, y + 29)
    ctx.lineTo(x + 26, y + 45)
    ctx.lineTo(x + 19, y + h - 4)
    ctx.stroke()
  }
}

function drawBase(ctx: CanvasRenderingContext2D, castle: Castle, x: number, y: number, w: number, h: number, cell: Cell): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  drawStoneCell(ctx, x, y + 2, w, h - 2, accent.main, damage, cell.col * 17 + 71)
  // Heavy timber sill.
  woodPanel(ctx, x + 4, y + h - 18, w - 8, 14, cell.col * 53 + 17, false, true)
  ctx.strokeStyle = '#3a2212'
  ctx.lineWidth = 1.3
  ctx.strokeRect(x + 4, y + h - 18, w - 8, 14)
  ironBand(ctx, x + 4, y + h - 16, w - 8, 4)
  nail(ctx, x + 9, y + h - 8, 1.2)
  nail(ctx, x + w - 9, y + h - 8, 1.2)
  // Iron corner straps.
  ironBand(ctx, x + 5, y + 4, 4, h - 23, true)
  ironBand(ctx, x + w - 9, y + 4, 4, h - 23, true)
  ctx.fillStyle = 'rgba(36,26,19,0.35)'
  ctx.beginPath()
  ctx.arc(x + w / 2 - 6, y + h * 0.45, 1.1, 0, TAU)
  ctx.arc(x + w / 2, y + h * 0.45, 1.1, 0, TAU)
  ctx.arc(x + w / 2 + 6, y + h * 0.45, 1.1, 0, TAU)
  ctx.fill()
  // Suspension spring peeking from below.
  ctx.strokeStyle = '#5f5145'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h + 2 + i * 2.6, 8, Math.PI, 0)
    ctx.stroke()
  }
  if (damage > 0.45) {
    ctx.fillStyle = 'rgba(30,22,16,0.35)'
    ctx.beginPath()
    ctx.moveTo(x + 8, y + 14)
    ctx.lineTo(x + 21, y + 22)
    ctx.lineTo(x + 16, y + 34)
    ctx.lineTo(x + 6, y + 29)
    ctx.closePath()
    ctx.fill()
  }
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  accent: string,
  seedValue = 1,
  side: Side = 'player',
): void {
  const random = mulberry32(seedValue * 29 + 7)
  ctx.save()
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  gradient.addColorStop(0, 'rgba(33,25,20,0.98)')
  gradient.addColorStop(0.55, 'rgba(65,45,31,0.96)')
  gradient.addColorStop(1, 'rgba(106,71,43,0.96)')
  ctx.fillStyle = gradient
  ctx.fillRect(x + 1, y + 3, w - 2, h - 3)
  // Back wall stones.
  ctx.strokeStyle = 'rgba(196,176,146,0.07)'
  ctx.lineWidth = 1
  for (let row = 0; row < 4; row += 1) {
    const ry = y + 6 + row * 10
    ctx.beginPath()
    ctx.moveTo(x + 4, ry)
    ctx.lineTo(x + w - 4, ry + 1)
    ctx.stroke()
  }
  // Arched window with evening light.
  const wx = x + w - 15
  const wy = y + 13
  ctx.fillStyle = 'rgba(255,213,150,0.25)'
  ctx.beginPath()
  ctx.arc(wx, wy, 7, Math.PI, 0)
  ctx.lineTo(wx + 7, wy + 8)
  ctx.lineTo(wx - 7, wy + 8)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,23,17,0.85)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  drawGlow(ctx, wx, wy + 2, 31, '#ffd59a', 0.28)
  drawLine(ctx, wx, wy - 6, wx, wy + 8, 'rgba(30,23,17,0.7)', 1)

  // Warm interior bounce light and a small rug.
  drawGlow(ctx, x + w / 2, y + h * 0.55, 24, '#ffb85c', 0.11)
  ctx.fillStyle = 'rgba(120,46,38,0.5)'
  fillRound(ctx, x + 17, y + h - 24, 20, 10, 2, 'rgba(120,46,38,0.5)')
  ctx.strokeStyle = 'rgba(255,201,74,0.35)'
  ctx.lineWidth = 0.8
  roundRectPath(ctx, x + 17.5, y + h - 23.5, 19, 9, 2)
  ctx.stroke()
  // Floor planks.
  const floorY = y + h - 15
  woodPanel(ctx, x + 2, floorY, w - 4, 11, seedValue * 13 + 4, false, true)
  ctx.strokeStyle = '#2c1a0e'
  ctx.lineWidth = 1
  for (let i = 1; i < 5; i += 1) {
    const px = x + 2 + (i * (w - 4)) / 5
    drawLine(ctx, px, floorY + 1, px + 1, floorY + 9, 'rgba(35,19,10,0.45)', 1)
  }
  nail(ctx, x + 6, floorY + 3, 1)
  nail(ctx, x + w - 7, floorY + 3, 1)

  // Ceiling beams.
  ctx.fillStyle = '#4d2e18'
  ctx.fillRect(x + 2, y + 4, w - 4, 3)
  ctx.fillStyle = 'rgba(255,243,214,0.1)'
  ctx.fillRect(x + 4, y + 4, w - 8, 1)
  for (const bx of [x + 12, x + w - 13]) {
    ctx.fillStyle = '#4a2c17'
    ctx.fillRect(bx, y + 5, 3, 10)
  }

  // A sparse cloth pennant; the room should read as lived-in, not as a parade.
  if (random() > 0.38) {
    ctx.fillStyle = side === 'player' ? '#2c5d8f' : '#8f2c2c'
    ctx.beginPath()
    ctx.moveTo(x + 8, y + 8)
    ctx.lineTo(x + 15, y + 9)
    ctx.lineTo(x + 14, y + 20)
    ctx.lineTo(x + 9, y + 18)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(36,26,19,0.5)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,243,214,0.22)'
    ctx.fillRect(x + 9, y + 10, 1.2, 7)
  }
  // Shelf with bottles and a book.
  ctx.fillStyle = '#4c2f1a'
  ctx.fillRect(x + 26, y + 24, 17, 2)
  ctx.fillStyle = '#6b4a2a'
  ctx.fillRect(x + 27, y + 26, 2, 4)
  ctx.fillStyle = 'rgba(143,190,154,0.7)'
  ctx.fillRect(x + 30, y + 19, 3, 6)
  ctx.fillStyle = 'rgba(196,157,95,0.75)'
  ctx.fillRect(x + 34, y + 21, 3, 4)
  ctx.fillStyle = 'rgba(95,115,150,0.8)'
  ctx.fillRect(x + 38, y + 20, 3, 5)
  // Barrel and crate in the corners.
  drawBarrel(ctx, x + 10, floorY - 1, 0.55)
  drawCrate(ctx, x + w - 12, floorY - 1, 0.56)
  drawTorch(ctx, x + w - 8, y + 31, time, 0.6)
  drawCobweb(ctx, x + 2, y + 4, 10, 0.22)
  drawIvy(ctx, x + w - 5, y + 1, 16, time, 'rgba(70,106,54,0.4)')
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(x + 1, y + 3, w - 2, 3)
  ctx.strokeStyle = 'rgba(36,26,19,0.9)'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1.5, y + 3.5, w - 3, h - 4)
  ctx.restore()
}

function drawCore(
  ctx: CanvasRenderingContext2D,
  castle: Castle,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: Cell,
  time: number,
): void {
  const accent = sideAccent(castle.side)
  const damage = 1 - cell.hp / cell.maxHp
  const pulse = 0.5 + Math.sin(time * 2.2) * 0.16
  ctx.save()
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  gradient.addColorStop(0, '#171311')
  gradient.addColorStop(0.55, '#30221b')
  gradient.addColorStop(1, '#513421')
  ctx.fillStyle = gradient
  fillRound(ctx, x + 1, y + 1, w - 2, h - 2, 5, '#171311')
  ctx.fillStyle = gradient
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4)
  // Stone arch.
  ctx.strokeStyle = 'rgba(205,191,167,0.4)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x + 7, y + h - 3)
  ctx.lineTo(x + 7, y + 20)
  ctx.quadraticCurveTo(x + w / 2, y - 2, x + w - 7, y + 20)
  ctx.lineTo(x + w - 7, y + h - 3)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,243,214,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
  // Gold filigree columns and crown.
  ctx.fillStyle = GOLD_DEEP
  ctx.fillRect(x + 4, y + 12, 3, h - 18)
  ctx.fillRect(x + w - 7, y + 12, 3, h - 18)
  ctx.fillStyle = GOLD
  for (const px of [x + 5.5, x + w - 5.5]) {
    nail(ctx, px, y + 16, 1.6)
    nail(ctx, px, y + h - 9, 1.6)
  }
  drawGlow(ctx, x + w / 2, y + h / 2 + 1, 30, accent.light, 0.2 + pulse * 0.18)
  // Gem/reliquary.
  const cx = x + w / 2
  const cy = y + h / 2 - 1
  ctx.fillStyle = accent.dark
  ctx.beginPath()
  ctx.moveTo(cx, cy - 15)
  ctx.lineTo(cx + 12, cy - 5)
  ctx.lineTo(cx + 8, cy + 10)
  ctx.lineTo(cx - 8, cy + 10)
  ctx.lineTo(cx - 12, cy - 5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = accent.light
  ctx.beginPath()
  ctx.arc(cx, cy - 1, 7.5, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#fff8d8'
  ctx.beginPath()
  ctx.arc(cx - 2, cy - 4, 2.6, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,242,190,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy - 1, 10, 0, TAU)
  ctx.stroke()
  // Crown above the gem.
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(cx - 9, cy - 18)
  ctx.lineTo(cx - 7, cy - 25)
  ctx.lineTo(cx - 2, cy - 20)
  ctx.lineTo(cx, cy - 27)
  ctx.lineTo(cx + 3, cy - 20)
  ctx.lineTo(cx + 8, cy - 25)
  ctx.lineTo(cx + 9, cy - 18)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.2
  ctx.stroke()
  // Candles.
  for (const px of [x + 11, x + w - 12]) {
    ctx.fillStyle = '#e8d6b2'
    ctx.fillRect(px - 1.5, y + h - 19, 3, 7)
    ctx.fillStyle = '#ffcf5c'
    ctx.beginPath()
    ctx.ellipse(px, y + h - 22, 1.7, 3.2 + Math.sin(time * 8 + px) * 0.5, 0, 0, TAU)
    ctx.fill()
    drawGlow(ctx, px, y + h - 22, 10, '#ffcf5c', 0.25)
  }
  // Small side banners.
  drawBanner(ctx, x + 1, y + 15, 7, 17, accent.dark, accent.main, time, false)
  drawBanner(ctx, x + w - 8, y + 15, 7, 17, accent.dark, accent.main, time, false)
  if (damage > 0.3) {
    ctx.strokeStyle = 'rgba(25,17,12,0.8)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + 13, y + 5)
    ctx.lineTo(x + 20, y + 22)
    ctx.lineTo(x + 14, y + 38)
    ctx.stroke()
    ctx.fillStyle = 'rgba(20,14,10,0.35)'
    ctx.fillRect(x + 15, y + 35, 7, 8)
  }
  ctx.restore()
}

function drawRubble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const random = mulberry32(seed)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h - 2, w * 0.44, 5, 0, 0, TAU)
  ctx.fill()
  for (let i = 0; i < 12; i += 1) {
    const px = x + 4 + random() * (w - 12)
    const py = y + h - 4 - random() * 9
    const size = 4 + random() * 8
    const stone = random() > 0.35
    if (stone) {
      const g = ctx.createLinearGradient(0, py - size, 0, py)
      g.addColorStop(0, '#cbbda5')
      g.addColorStop(1, '#88765f')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(px, py - size)
      ctx.lineTo(px + size, py - size * 0.4)
      ctx.lineTo(px + size * 0.6, py)
      ctx.lineTo(px - size * 0.5, py)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(36,26,19,0.7)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      ctx.fillStyle = '#5b351d'
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(random() * 2)
      ctx.fillRect(-size * 0.4, -3, size * 1.1, 3)
      ctx.restore()
    }
  }
  // A bent shield or helmet, half buried.
  ctx.save()
  ctx.translate(x + w * 0.62, y + h - 5)
  ctx.rotate(-0.35)
  drawShield(ctx, 0, 0, 0.45, 'rgba(80,66,52,0.7)', 'rgba(120,102,82,0.7)')
  ctx.restore()
  ctx.strokeStyle = 'rgba(36,26,19,0.4)'
  ctx.lineWidth = 1
  for (let i = 0; i < 2; i += 1) {
    const px = x + 8 + random() * (w - 18)
    ctx.beginPath()
    ctx.moveTo(px, y + h - 6)
    ctx.quadraticCurveTo(px + 3, y + h - 15, px + 8, y + h - 20)
    ctx.stroke()
  }
  ctx.restore()
}

function drawDamageSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  seedValue: number,
): void {
  const random = mulberry32(seedValue * 17 + 3)
  for (let i = 0; i < 3; i += 1) {
    const t = ((time * (0.16 + i * 0.03) + random()) % 1 + 1) % 1
    const px = x + w * (0.25 + random() * 0.5) + Math.sin(time * 1.2 + i) * 4
    const py = y + h * 0.55 - t * (h * 0.7)
    const alpha = (1 - t) * 0.16
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = i % 2 === 0 ? '#8a7a68' : '#4d443b'
    ctx.beginPath()
    ctx.arc(px, py, 3 + t * 7, 0, TAU)
    ctx.fill()
    if (i === 0 && t < 0.35) {
      ctx.fillStyle = '#ffb85c'
      ctx.beginPath()
      ctx.arc(px + 2, py + 4, 1.2, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawFallenUnit(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  ctx.save()
  ctx.translate(unit.x, unit.y)
  ctx.scale(unit.side === 'player' ? 1 : -1, 1)
  ctx.fillStyle = 'rgba(0,0,0,0.24)'
  ctx.beginPath()
  ctx.ellipse(0, 1, 13, 3, 0, 0, TAU)
  ctx.fill()
  ctx.save()
  ctx.translate(-3, -1)
  ctx.rotate(-0.2)
  drawShield(ctx, 0, 0, 0.6, 'rgba(90,80,68,0.75)', 'rgba(135,118,96,0.75)')
  ctx.restore()
  ctx.fillStyle = 'rgba(150,160,168,0.75)'
  ctx.beginPath()
  ctx.arc(7, -2, 5, Math.PI, 0)
  ctx.lineTo(12, 0)
  ctx.lineTo(2, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(36,26,19,0.7)'
  ctx.lineWidth = 1.3
  ctx.stroke()
  ctx.strokeStyle = 'rgba(120,95,62,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-15, -2)
  ctx.lineTo(13, -4)
  ctx.stroke()
  ctx.globalAlpha = 0.18 + Math.sin(time * 1.5) * 0.05
  ctx.fillStyle = '#fff3d6'
  ctx.beginPath()
  ctx.arc(0, -18 - Math.sin(time * 2) * 2, 3.5, 0, TAU)
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
      drawStoneCell(ctx, x, y, w, h, accent.main, 1 - cell.hp / cell.maxHp, cell.col * 31 + cell.row * 17 + 7)
      woodPanel(ctx, x + 5, y + h - 13, w - 10, 8, cell.col * 53 + cell.row * 7 + 11, false, true)
      ironBand(ctx, x + 4, y + h - 12, w - 8, 3)
      if ((cell.col + cell.row) % 3 === 0) drawArrowSlit(ctx, x + w - 12, y + h * 0.42, 5, 12)
      if (cell.level > 1) {
        for (let i = 0; i < cell.level; i += 1) {
          ctx.fillStyle = GOLD
          ctx.beginPath()
          ctx.arc(x + 7 + i * 5, y + 6, 1.5, 0, TAU)
          ctx.fill()
        }
      }
      break
    case 'base':
      drawBase(ctx, castle, x, y, w, h, cell)
      break
    case 'core':
      drawCore(ctx, castle, x, y, w, h, cell, time)
      break
    case 'room':
      drawRoom(ctx, x, y, w, h, time, accent.main, cell.col * 17 + cell.row * 31 + 5, castle.side)
      break
    case 'rubble':
      drawRubble(ctx, x, y, w, h, cell.col * 13 + cell.row * 7)
      break
    default:
      break
  }
  if (cell.hp > 0 && cell.maxHp > 0 && cell.hp / cell.maxHp < 0.58 && cell.kind !== 'room') {
    drawDamageSmoke(ctx, x, y, w, h, time + cell.col * 0.6 + cell.row * 0.3, cell.col * 37 + cell.row * 11 + 3)
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

  const blinking = Math.sin(time * 1.9 + unit.bob) > 0.95
  const teamColor = unit.side === 'player' ? '#3f7fd1' : '#d6453d'
  const body = (base: string, dark: string, w = 16, h = 18, y = -20): void => {
    ctx.fillStyle = dark
    fillRound(ctx, -w / 2 + 1, y + 4, w, h, 4, dark)
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, base)
    grad.addColorStop(1, dark)
    ctx.fillStyle = grad
    roundRectPath(ctx, -w / 2, y, w, h - 2, 4)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(-w / 2 + 2, y + 2, 2, h - 7)
  }

  const legs = (color: string): void => {
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    drawLine(ctx, -4, -4, -5, -1, color, 3)
    drawLine(ctx, 4, -4, 5, -1, color, 3)
  }

  const boots = (color = '#403328'): void => {
    fillRound(ctx, -8, -3, 6, 4, 1.5, color)
    fillRound(ctx, 2, -3, 6, 4, 1.5, color)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(-7, -2.6, 4, 1)
    ctx.fillRect(3, -2.6, 4, 1)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(-8, 0.5)
    ctx.lineTo(-2, 0.5)
    ctx.moveTo(2, 0.5)
    ctx.lineTo(8, 0.5)
    ctx.stroke()
  }

  const belt = (color = '#3b2a1d'): void => {
    ctx.fillStyle = color
    ctx.fillRect(-7, -10, 14, 3)
    ctx.fillStyle = GOLD
    ctx.fillRect(-1.5, -10.5, 3, 4)
    ctx.strokeStyle = 'rgba(36,26,19,0.6)'
    ctx.lineWidth = 0.7
    ctx.strokeRect(-1.5, -10.5, 3, 4)
  }

  const cape = (color: string, trim: string): void => {
    ctx.save()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-8, -27)
    ctx.lineTo(-9, -8)
    ctx.quadraticCurveTo(-3, -4 + Math.sin(time * 2 + unit.bob) * 1.5, 1, -7)
    ctx.quadraticCurveTo(6, -5, 9, -9)
    ctx.lineTo(8, -27)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.strokeStyle = trim
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-7, -25)
    ctx.lineTo(-8, -10)
    ctx.stroke()
    ctx.restore()
  }

  const head = (skin: string, size = 7, y = -31): void => {
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(0, y, size, 0, TAU)
    ctx.fill()
    const grad = ctx.createLinearGradient(0, y - size, 0, y + size)
    grad.addColorStop(0, 'rgba(255,255,255,0.24)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0)')
    grad.addColorStop(1, 'rgba(67,32,18,0.18)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, y, size, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.8
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,225,180,0.35)'
    ctx.beginPath()
    ctx.ellipse(-size * 0.36, y - size * 0.22, size * 0.28, size * 0.18, -0.4, 0, TAU)
    ctx.fill()
  }

  const eye = (y = -30): void => {
    ctx.strokeStyle = '#6b4a35'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(-4, y - 2.6)
    ctx.lineTo(-2.2, y - 3.1)
    ctx.moveTo(2.2, y - 3.1)
    ctx.lineTo(4, y - 2.6)
    ctx.stroke()
    if (blinking) {
      ctx.strokeStyle = INK
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(-4.2, y)
      ctx.lineTo(-2.2, y + 0.4)
      ctx.moveTo(2.2, y + 0.4)
      ctx.lineTo(4.2, y)
      ctx.stroke()
    } else {
      ctx.fillStyle = '#fff8e7'
      ctx.beginPath()
      ctx.ellipse(-3.2, y, 1.65, 1.1, 0, 0, TAU)
      ctx.ellipse(3.2, y, 1.65, 1.1, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#2b1d15'
      ctx.beginPath()
      ctx.arc(-2.6, y + 0.1, 0.85, 0, TAU)
      ctx.arc(2.6, y + 0.1, 0.85, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath()
      ctx.arc(-2.9, y - 0.35, 0.25, 0, TAU)
      ctx.arc(2.3, y - 0.35, 0.25, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(112,58,42,0.7)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(0, y + 4.2, 2.2, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }

  const teamBand = (): void => {
    ctx.fillStyle = teamColor
    ctx.fillRect(-9.5, -18, 3, 7)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(-9, -17.5, 1, 5)
  }

  switch (unit.kind) {
    case 'archer': {
      cape('#2f5c38', '#b9e68a')
      legs('#335c36')
      body(def.color, '#2f5c38', 15, 17, -21)
      boots('#3b2d22')
      belt('#4a3524')
      teamBand()
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
      cape('#2e4366', '#d94b42')
      legs('#3c4c62')
      body(def.color, '#2e4366', 19, 18, -22)
      boots('#2b2e36')
      belt('#4d3b2a')
      teamBand()
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
      boots('#3b2d22')
      belt('#4b3320')
      teamBand()
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
      woodPanel(ctx, -16, -11, 32, 7, 44, false, true)
      ironBand(ctx, -16, -5, 32, 2)
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
      cape('#3d2957', '#e0b8ff')
      legs('#4a3268')
      body(def.color, '#4a3268', 16, 20, -24)
      boots('#2f2038')
      belt('#6a4a8a')
      teamBand()
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
      boots('#443523')
      belt('#4b3a25')
      teamBand()
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
      boots('#403027')
      belt('#3b2a1d')
      teamBand()
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
      cape('#23675f', '#baf5e8')
      legs('#3e4f3b')
      body(def.color, '#23675f', 15, 17, -21)
      boots('#332e22')
      belt('#4a3a2a')
      teamBand()
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

function drawCannon(ctx: CanvasRenderingContext2D, castle: Castle, time: number, support = true): void {
  const pos = cannonPosition(castle)
  const accent = sideAccent(castle.side)
  const direction = castle.side === 'player' ? 1 : -1
  const angle = (castle.cannonAngle * Math.PI) / 180
  const recoil = castle.cannonRecoil * 8
  ctx.save()
  ctx.translate(pos.x, pos.y)
  // Soft shadow on the roof.
  ctx.fillStyle = 'rgba(0,0,0,0.24)'
  ctx.beginPath()
  ctx.ellipse(0, 12, 36, 7, 0, 0, TAU)
  ctx.fill()

  // Iron-shod legs seat the carriage on the roof or the keep.
  ctx.fillStyle = '#4b2d17'
  fillRound(ctx, -14, 10, 5, 22, 2, '#4b2d17')
  fillRound(ctx, 9, 10, 5, 22, 2, '#4b2d17')
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.4
  roundRectPath(ctx, -14, 10, 5, 22, 2)
  ctx.stroke()
  roundRectPath(ctx, 9, 10, 5, 22, 2)
  ctx.stroke()
  nail(ctx, -11.5, 25, 1.2)
  nail(ctx, 11.5, 25, 1.2)
  // Small carriage wheels under the gun.
  drawWheelDetailed(ctx, -24, 13, 9, time)
  drawWheelDetailed(ctx, 24, 13, 9, time)
  ctx.strokeStyle = '#3a2415'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-24, 13)
  ctx.lineTo(24, 13)
  ctx.stroke()

  // Wooden carriage.
  woodPanel(ctx, -32, -10, 64, 23, castle.side === 'player' ? 17 : 29, false, false)
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  roundRectPath(ctx, -32, -10, 64, 23, 6)
  ctx.stroke()
  ironBand(ctx, -32, -8, 64, 4)
  ironBand(ctx, -32, 7, 64, 4)
  for (const px of [-25, 25]) nail(ctx, px, 1, 1.6)
  // Side shield/crest.
  drawShield(ctx, 0, 3, 0.52, accent.dark, accent.main)
  // Elevation arc and brass pointer.
  ctx.strokeStyle = 'rgba(255,201,74,0.8)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(4, 0, 15, -angle - 0.15, -angle + 0.55)
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(4 + Math.cos(-angle) * 15, Math.sin(-angle) * 15, 1.8, 0, TAU)
  ctx.fill()

  // Powder keg, cannonballs and rammer around the mount.
  drawPowderKeg(ctx, -45, 0, 0.72)
  drawCannonballPile(ctx, 45, 3, 0.72)
  ctx.strokeStyle = '#6b4a2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-39, -9)
  ctx.lineTo(-30, -19)
  ctx.stroke()
  ctx.fillStyle = '#9aa0a2'
  ctx.beginPath()
  ctx.arc(-30, -19, 2.5, 0, TAU)
  ctx.fill()

  // Barrel, recoiling along its axis.
  ctx.save()
  ctx.scale(direction, 1)
  ctx.rotate(-angle)
  ctx.translate(-recoil, 0)
  // Breech.
  ctx.fillStyle = '#3a3530'
  ctx.beginPath()
  ctx.ellipse(1, -1.5, 9, 10.5, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.stroke()
  // Tapered iron tube.
  const barrelGrad = ctx.createLinearGradient(0, -14, 0, 10)
  barrelGrad.addColorStop(0, '#8d8880')
  barrelGrad.addColorStop(0.32, '#5a554f')
  barrelGrad.addColorStop(0.7, '#3e3a35')
  barrelGrad.addColorStop(1, '#24211e')
  ctx.fillStyle = barrelGrad
  ctx.beginPath()
  ctx.moveTo(4, -12)
  ctx.lineTo(38, -9)
  ctx.lineTo(40, 8)
  ctx.lineTo(9, 11)
  ctx.quadraticCurveTo(2, 8, 4, -12)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.moveTo(9, -8)
  ctx.lineTo(35, -6)
  ctx.lineTo(35, -3)
  ctx.lineTo(9, -5)
  ctx.closePath()
  ctx.fill()
  // Iron bands.
  for (const bx of [12, 25, 36]) {
    ctx.strokeStyle = '#26221f'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(bx, -10.5 + (bx - 12) * 0.03)
    ctx.lineTo(bx + 1, 8.5)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(bx + 1, -9)
    ctx.lineTo(bx + 2, 7)
    ctx.stroke()
  }
  // Muzzle ring.
  ctx.fillStyle = '#49443e'
  fillRound(ctx, 36, -11, 8, 20, 3, '#49443e')
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.4
  roundRectPath(ctx, 36, -11, 8, 20, 3)
  ctx.stroke()
  ctx.fillStyle = '#171513'
  ctx.beginPath()
  ctx.ellipse(44, -1, 3.4, 8.4, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = GOLD_DEEP
  ctx.lineWidth = 1.2
  ctx.stroke()
  // Touch-hole and linstock.
  ctx.strokeStyle = '#e0b45c'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(10, -11)
  ctx.lineTo(15, -19)
  ctx.stroke()
  // Muzzle flash with layered petals, smoke rings and sparks.
  if (castle.cannonFlash > 0) {
    const flash = Math.max(0, Math.min(1, castle.cannonFlash / 0.16))
    drawGlow(ctx, 52, -1, 24 + flash * 24, '#ffe08a', 0.6 * flash)
    ctx.fillStyle = '#fff8d8'
    starPath(ctx, 52, -1, 11 + flash * 9, 9, 0.32)
    ctx.fill()
    ctx.strokeStyle = '#ffc94a'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.globalAlpha = flash * 0.7
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeStyle = i === 0 ? '#fff3d6' : '#ffc94a'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(52, -1, 16 + i * 8 + (1 - flash) * 12, 0, TAU)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // Powder smoke curling from the muzzle after the shot.
  if (castle.cannonFlash > 0) {
    const t = 1 - castle.cannonFlash / 0.16
    for (let i = 0; i < 3; i += 1) {
      ctx.save()
      ctx.globalAlpha = (1 - t) * 0.22
      ctx.fillStyle = '#d5c0a0'
      ctx.beginPath()
      ctx.arc(direction * (48 + i * 9 + t * 15), -6 - i * 4 - t * 18, 5 + i * 3 + t * 8, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawCannonMast(ctx: CanvasRenderingContext2D, castle: Castle): void {
  const roof = castle.cells.find((cell) => cell.moduleId === 'roof')
  if (roof && roof.hp > 0) return
  const pos = cannonPosition(castle)
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.fillStyle = '#5a351c'
  fillRound(ctx, -8, 10, 16, 66, 3, '#5a351c')
  woodPanel(ctx, -7, 11, 14, 64, 83, true, true)
  ironBand(ctx, -9, 20, 18, 4)
  ironBand(ctx, -9, 54, 18, 4)
  ctx.strokeStyle = '#3a2415'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-8, 28)
  ctx.lineTo(8, 44)
  ctx.moveTo(8, 28)
  ctx.lineTo(-8, 44)
  ctx.stroke()
  nail(ctx, 0, 13, 1.5)
  nail(ctx, 0, 72, 1.5)
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
      case 'confetti': {
        ctx.rotate(particle.rotation)
        ctx.fillStyle = particle.color
        ctx.globalAlpha = Math.min(1, life * 2.4) * particle.alpha
        ctx.fillRect(-particle.size, -particle.size * 0.42, particle.size * 2, particle.size * 0.84)
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.fillRect(-particle.size, -particle.size * 0.42, particle.size * 2, particle.size * 0.22)
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
  if (!options.showSlots) drawCannonMast(ctx, castle)
  const sorted = [...castle.cells].sort((a, b) => b.row - a.row || a.col - b.col)
  for (const cell of sorted) drawCell(ctx, castle, cell, time)
  const roof = castle.cells.find((cell) => cell.moduleId === 'roof')
  if ((!roof || roof.hp <= 0) && castle.core.hp > 0) drawCoreMarker(ctx, castle, time)
  for (const unit of castle.units) {
    if (unit.dead) drawFallenUnit(ctx, unit, time)
    else drawUnit(ctx, unit, time)
  }
  drawCannon(ctx, castle, time, !options.showSlots)
  if (options.showSlots) {
    drawBuildSlots(ctx, castle, time, options)
    if (options.tab === 'units') drawUnitSlots(ctx, castle, time, options.selected ?? null)
  }
  ctx.restore()
}

export function drawHomeScene(ctx: CanvasRenderingContext2D, time: number, hero: Castle, enemyTower: Castle | null): void {
  drawBackground(ctx, hero.palette, time, 'dusk')
  if (enemyTower) drawCastle(ctx, enemyTower, time, { dim: true })
  drawCastle(ctx, hero, time)
  drawPaperOverlay(ctx)
}

export function drawBuildScene(
  ctx: CanvasRenderingContext2D,
  time: number,
  castle: Castle,
  options: CastleDrawOptions,
  arena: ArenaId = 'dusk',
): void {
  drawBackground(ctx, castle.palette, time, arena)
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
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = '#fff3d6'
  ctx.lineWidth = 11
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath()
    ctx.moveTo(-80 + i * 90, 420)
    ctx.lineTo(80 + i * 90, 208)
    ctx.stroke()
  }
  ctx.restore()
  drawCastleEmblem(ctx, 250 - slide * 0.4, 240, 1.5, 'rgba(255,243,214,0.75)')
  drawCastleEmblem(ctx, WORLD.w - 250 + slide * 0.4, 240, 1.5, 'rgba(255,243,214,0.75)')
  ctx.save()
  ctx.strokeStyle = 'rgba(255,201,74,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-100, 208)
  ctx.lineTo(560 + slide, 208)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(WORLD.w + 100, 208)
  ctx.lineTo(WORLD.w - 560 - slide, 208)
  ctx.stroke()
  ctx.restore()
  const scale = 0.85 + Math.sin(clamp(t * 5, 0, 1) * Math.PI) * 0.2
  ctx.translate(WORLD.w / 2, 315)
  ctx.scale(scale, scale)
  drawText(ctx, 'VS', 0, 0, 94, GOLD)
  ctx.restore()

  // Counting down to the first shot; the last beat becomes the starting pistol.
  const elapsed = t * 1.45
  const step = Math.min(3, Math.floor(elapsed / 0.34))
  const labels = ['3', '2', '1', '¡FUEGO!'] as const
  const local = Math.min(1, (elapsed - step * 0.34) / 0.34)
  const pop = 1 + Math.sin(local * Math.PI) * 0.12
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, (1 - t) / 0.16))
  const centerX = WORLD.w / 2
  ctx.fillStyle = 'rgba(7,19,17,0.56)'
  fillRound(ctx, centerX - 176, 424, 352, 82, 18, 'rgba(7,19,17,0.56)')
  ctx.strokeStyle = 'rgba(255,201,74,0.45)'
  ctx.lineWidth = 2
  roundRectPath(ctx, centerX - 176, 424, 352, 82, 18)
  ctx.stroke()
  drawSmallText(ctx, step === 3 ? '¡FUEGO!' : 'PREPARADOS', centerX, 440, 10, 'rgba(255,243,214,0.62)')
  ctx.translate(centerX, 480)
  ctx.scale(pop, pop)
  drawText(ctx, labels[step] ?? '3', 0, 0, step === 3 ? 46 : 64, step === 3 ? GOLD : CREAM, 'center', true)
  ctx.restore()
}

export function drawBattleScene(ctx: CanvasRenderingContext2D, time: number, battle: Battle): void {
  drawBackground(ctx, battle.arena.palette, time, battle.arena.id)
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

const modulePortraitCache = new Map<string, string>()

export function drawModulePortrait(module: ModuleId, side: Side = 'player'): string {
  const key = `${side}:${module}`
  const cached = modulePortraitCache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 112
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const def = MODULE_BY_ID[module]
  const cell: Cell = {
    col: 0,
    row: 0,
    kind: def.kind,
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
  const fake: Castle = {
    side,
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
    palette: PALETTES.dusk,
  }
  ctx.save()
  ctx.translate(18, 46)
  ctx.scale(1.1, 1.1)
  drawCell(ctx, fake, cell, 0)
  ctx.restore()
  const url = canvas.toDataURL('image/png')
  modulePortraitCache.set(key, url)
  return url
}


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
