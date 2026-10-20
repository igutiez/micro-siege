import {
  CASTLE_H,
  CASTLE_W,
  CELL,
  CORE_CELL,
  CORE_HP,
  COLS,
  FIXED_BASES,
  MODULE_BY_ID,
  MODULES,
  ROWS,
  UNIT_SLOTS,
  UNIT_BY_ID,
} from './config.ts'
import type { Castle, Cell, ModuleDef, ModuleId, Palette, Side, Unit, UnitId } from './types.ts'

export interface CastleEvent {
  type: 'damage' | 'destroy' | 'fall' | 'land' | 'core'
  x: number
  y: number
  cell: Cell
  amount?: number
}

export type ModuleLevels = Record<ModuleId, number>

export function cellKey(col: number, row: number): string {
  return `${col}:${row}`
}

function emptyCell(col: number, row: number): Cell {
  return {
    col,
    row,
    kind: 'empty',
    level: 0,
    hp: 0,
    maxHp: 0,
    maxHpBase: 0,
    falling: false,
    fallY: 0,
    fallVy: 0,
    fallRotation: 0,
    flash: 0,
    hitFlash: 0,
  }
}

function makeCell(module: ModuleDef, level: number): Cell {
  return {
    col: module.col,
    row: module.row,
    kind: module.kind,
    moduleId: module.id,
    level,
    hp: module.hp + module.hpPerLevel * Math.max(0, level - 1),
    maxHp: module.hp + module.hpPerLevel * Math.max(0, level - 1),
    maxHpBase: module.hp,
    falling: false,
    fallY: 0,
    fallVy: 0,
    fallRotation: 0,
    flash: 0,
    hitFlash: 0,
  }
}

export function sanitizeLevels(levels: ModuleLevels): ModuleLevels {
  const next = { ...levels }
  for (const module of MODULES) {
    if (next[module.id] <= 0) {
      next[module.id] = 0
      continue
    }
    if (module.support && next[module.support] <= 0) next[module.id] = 0
  }
  return next
}

export function buildCells(levels: ModuleLevels): Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) cells.push(emptyCell(col, row))
  }
  const put = (cell: Cell): void => {
    const index = cells.findIndex((entry) => entry.col === cell.col && entry.row === cell.row)
    if (index >= 0) cells[index] = cell
  }

  const safeLevels = sanitizeLevels(levels)
  for (const module of MODULES) {
    const level = safeLevels[module.id]
    if (level > 0) put(makeCell(module, level))
  }

  for (const base of FIXED_BASES) {
    const cell = emptyCell(base.col, base.row)
    cell.kind = 'base'
    cell.level = 1
    cell.hp = 260
    cell.maxHp = 260
    cell.maxHpBase = 260
    put(cell)
  }

  const core = emptyCell(CORE_CELL.col, CORE_CELL.row)
  core.kind = 'core'
  core.level = 1
  core.hp = CORE_HP
  core.maxHp = CORE_HP
  core.maxHpBase = CORE_HP
  put(core)

  for (let row = 1; row <= 2; row += 1) {
    for (let col = 1; col <= 3; col += 1) {
      const cell = emptyCell(col, row)
      cell.kind = 'room'
      put(cell)
    }
  }

  return cells.sort((a, b) => a.row - b.row || a.col - b.col)
}

function unitFromSlot(
  side: Side,
  kind: UnitId,
  col: number,
  row: number,
  x: number,
  y: number,
  level: number,
  index: number,
): Unit {
  const def = UNIT_BY_ID[kind]
  const maxHp = Math.round(def.hp + def.hpPerLevel * (level - 1))
  return {
    id: `${side}-${kind}-${index}`,
    side,
    kind,
    x,
    y,
    hp: maxHp,
    maxHp,
    level,
    cooldown: 0.25 + index * 0.24,
    attackTimer: 0,
    bob: Math.random() * Math.PI * 2,
    flash: 0,
    dead: false,
    cellCol: col,
    cellRow: row,
    recoil: 0,
  }
}

export interface CastleOptions {
  side: Side
  x: number
  y: number
  levels: ModuleLevels
  loadout: (UnitId | null)[]
  unitLevels: Partial<Record<UnitId, number>>
  name: string
  trophies: number
  palette: Palette
  scale?: number
}

export function createCastle(options: CastleOptions): Castle {
  const cells = buildCells(options.levels)
  const core = cells.find((cell) => cell.kind === 'core')
  if (!core) throw new Error('castle needs a core')

  const units: Unit[] = []
  options.loadout.slice(0, UNIT_SLOTS.length).forEach((kind, index) => {
    if (kind === null) return
    const slot = UNIT_SLOTS[index]
    if (!slot) return
    const level = options.unitLevels[kind] ?? 1
    const x = options.x + (slot.col + 0.5) * CELL
    const y = options.y + (slot.row + 0.9) * CELL
    units.push(unitFromSlot(options.side, kind, slot.col, slot.row, x, y, level, index))
  })

  return {
    side: options.side,
    x: options.x,
    y: options.y,
    scale: options.scale ?? 1,
    cells,
    units,
    core,
    cannonAngle: 45,
    cannonRecoil: 0,
    cannonFlash: 0,
    name: options.name,
    trophies: options.trophies,
    palette: options.palette,
  }
}

export function castleBottom(castle: Castle): number {
  return castle.y + CASTLE_H
}

export function castleWidth(): number {
  return CASTLE_W
}

export function cannonPosition(castle: Castle): { x: number; y: number } {
  return {
    x: castle.x + CASTLE_W / 2,
    y: castle.y - 16 - (castle.side === 'player' ? 0 : 0),
  }
}

export function cellRect(castle: Castle, cell: Cell): { x: number; y: number; w: number; h: number } {
  return {
    x: castle.x + cell.col * CELL,
    y: castle.y + cell.row * CELL + cell.fallY,
    w: CELL,
    h: CELL,
  }
}

export function cellCenter(castle: Castle, cell: Cell): { x: number; y: number } {
  return {
    x: castle.x + (cell.col + 0.5) * CELL,
    y: castle.y + (cell.row + 0.5) * CELL + cell.fallY,
  }
}

export function moduleCell(castle: Castle, id: ModuleId): Cell | undefined {
  return castle.cells.find((cell) => cell.moduleId === id)
}

export function activeModuleCells(castle: Castle): Cell[] {
  return castle.cells.filter((cell) => cell.moduleId !== undefined && cell.kind !== 'empty' && cell.kind !== 'rubble')
}

export function isStructural(cell: Cell): boolean {
  return cell.kind === 'wall' || cell.kind === 'tower' || cell.kind === 'base' || cell.kind === 'roof' || cell.kind === 'core'
}

export function isAlive(cell: Cell): boolean {
  return isStructural(cell) && cell.hp > 0 && !cell.falling
}

export function coreHpPercent(castle: Castle): number {
  return Math.max(0, Math.min(100, (castle.core.hp / castle.core.maxHp) * 100))
}

export function castleHpPercent(castle: Castle): number {
  return coreHpPercent(castle)
}

export function totalHpPercent(castle: Castle): number {
  let hp = 0
  let max = 0
  for (const cell of castle.cells) {
    if (cell.maxHp <= 0) continue
    hp += Math.max(0, cell.hp)
    max += cell.maxHp
  }
  return max > 0 ? (hp / max) * 100 : 0
}

export function aliveUnits(castle: Castle): Unit[] {
  return castle.units.filter((unit) => !unit.dead)
}

export function unitRect(unit: Unit): { x: number; y: number; w: number; h: number } {
  return { x: unit.x - 13, y: unit.y - 38, w: 26, h: 38 }
}

export function damageCell(
  castle: Castle,
  cell: Cell,
  amount: number,
  events: CastleEvent[],
): number {
  if (!isStructural(cell) || cell.hp <= 0) return 0
  const applied = Math.min(cell.hp, amount)
  cell.hp = Math.max(0, cell.hp - amount)
  cell.hitFlash = 1
  cell.flash = Math.max(cell.flash, 0.18)
  const center = cellCenter(castle, cell)
  events.push({ type: 'damage', x: center.x, y: center.y, cell, amount: applied })
  if (cell.hp <= 0) {
    const wasCore = cell.kind === 'core'
    cell.kind = 'rubble'
    cell.falling = false
    cell.hp = 0
    events.push({ type: 'destroy', x: center.x, y: center.y, cell })
    collapseUnsupported(castle, events)
    if (wasCore) events.push({ type: 'core', x: center.x, y: center.y, cell })
  }
  return applied
}

export function collapseUnsupported(castle: Castle, events: CastleEvent[]): void {
  let changed = true
  while (changed) {
    changed = false
    for (const module of MODULES) {
      const cell = moduleCell(castle, module.id)
      if (!cell || cell.kind === 'empty' || cell.kind === 'rubble' || cell.falling) continue
      if (!module.support) continue
      const support = moduleCell(castle, module.support)
      if (support && support.kind !== 'rubble' && support.hp > 0) continue
      cell.falling = true
      cell.fallVy = 0
      cell.fallRotation = (Math.random() - 0.5) * 0.2
      const center = cellCenter(castle, cell)
      events.push({ type: 'fall', x: center.x, y: center.y, cell })
      changed = true
    }
  }
}

export function fallTarget(cell: Cell): number {
  return (ROWS - 1 - cell.row) * CELL + CELL * 0.62
}

export function updateCastle(castle: Castle, dt: number, events: CastleEvent[]): void {
  for (const cell of castle.cells) {
    cell.flash = Math.max(0, cell.flash - dt * 3.5)
    cell.hitFlash = Math.max(0, cell.hitFlash - dt * 5)
    if (cell.falling) {
      cell.fallVy += 1350 * dt
      cell.fallY += cell.fallVy * dt
      cell.fallRotation += dt * (cell.fallVy / 220)
      if (cell.fallY >= fallTarget(cell)) {
        cell.fallY = fallTarget(cell)
        cell.falling = false
        cell.kind = 'rubble'
        cell.hp = 0
        cell.fallVy = 0
        const center = cellCenter(castle, cell)
        events.push({ type: 'land', x: center.x, y: center.y, cell })
      }
    }
  }

  for (const unit of castle.units) {
    if (unit.dead) continue
    unit.bob += dt * 2.6
    unit.flash = Math.max(0, unit.flash - dt * 4)
    unit.recoil = Math.max(0, unit.recoil - dt * 4)
    if (unit.hp <= 0) {
      unit.dead = true
      unit.hp = 0
    }
  }
}

export function damageUnit(unit: Unit, amount: number): number {
  if (unit.dead) return 0
  const applied = Math.min(unit.hp, amount)
  unit.hp = Math.max(0, unit.hp - amount)
  unit.flash = 1
  if (unit.hp <= 0) unit.dead = true
  return applied
}

export function findCellAt(castle: Castle, x: number, y: number): Cell | undefined {
  for (const cell of castle.cells) {
    if (cell.kind === 'empty' || cell.kind === 'room' || cell.kind === 'rubble') continue
    const rect = cellRect(castle, cell)
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return cell
  }
  return undefined
}

export function findUnitAt(castle: Castle, x: number, y: number): Unit | undefined {
  for (const unit of castle.units) {
    if (unit.dead) continue
    const rect = unitRect(unit)
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return unit
  }
  return undefined
}

export function exposedCore(castle: Castle): boolean {
  return castle.core.hp > 0
}

export function repairObjective(castle: Castle): Cell | undefined {
  const damaged = activeModuleCells(castle).filter((cell) => cell.hp < cell.maxHp && !cell.falling)
  damaged.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
  return damaged[0]
}

export function repairCell(cell: Cell, amount: number): number {
  if (!isStructural(cell) || cell.hp <= 0) return 0
  const healed = Math.min(cell.maxHp - cell.hp, amount)
  cell.hp += healed
  cell.flash = 0.2
  return healed
}

export function worldCastleBounds(castle: Castle): { x: number; y: number; w: number; h: number } {
  return { x: castle.x - 10, y: castle.y - 40, w: CASTLE_W + 20, h: CASTLE_H + 80 }
}

export function moduleAt(castle: Castle, id: ModuleId): ModuleDef {
  return MODULE_BY_ID[id]
}

export function sideAccent(side: Side): { main: string; light: string; dark: string } {
  return side === 'player'
    ? { main: '#3f7fd1', light: '#8fc1ff', dark: '#22507f' }
    : { main: '#d6453d', light: '#ff9b8e', dark: '#8e241f' }
}
