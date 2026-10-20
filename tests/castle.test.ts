import { describe, expect, it } from 'vitest'
import {
  aliveUnits,
  buildCells,
  cannonPosition,
  cellRect,
  coreHpPercent,
  createCastle,
  damageCell,
  damageUnit,
  repairCell,
  totalHpPercent,
  updateCastle,
  type CastleEvent,
} from '../src/game/castle.ts'
import { PALETTES, STARTING_MODULE_LEVELS } from '../src/game/config.ts'

function makeCastle(levels = { ...STARTING_MODULE_LEVELS }) {
  return createCastle({
    side: 'player',
    x: 100,
    y: 200,
    levels,
    loadout: ['archer', 'knight'],
    unitLevels: { archer: 1, knight: 1 },
    name: 'TEST',
    trophies: 0,
    palette: PALETTES.dusk,
  })
}

describe('castle grid', () => {
  it('builds a 5x4 grid with a core, fixed bases and rooms', () => {
    const cells = buildCells(STARTING_MODULE_LEVELS)
    expect(cells).toHaveLength(20)
    expect(cells.find((cell) => cell.kind === 'core')?.col).toBe(2)
    expect(cells.find((cell) => cell.kind === 'core')?.row).toBe(3)
    expect(cells.filter((cell) => cell.kind === 'base')).toHaveLength(4)
    expect(cells.find((cell) => cell.kind === 'base' && cell.row === 3 && (cell.col === 1 || cell.col === 3))).toBeDefined()
    expect(cells.filter((cell) => cell.kind === 'room')).toHaveLength(6)
  })

  it('creates units on the correct side and exposes the cannon position', () => {
    const castle = makeCastle()
    expect(castle.units).toHaveLength(2)
    expect(aliveUnits(castle)).toHaveLength(2)
    expect(cannonPosition(castle).x).toBe(castle.x + 130)
    expect(coreHpPercent(castle)).toBe(100)
  })

  it('damages a wall, collapses the tower above it and lands as rubble', () => {
    const castle = makeCastle({ ...STARTING_MODULE_LEVELS, towerL: 1 })
    const wall = castle.cells.find((cell) => cell.moduleId === 'wallL1')
    const tower = castle.cells.find((cell) => cell.moduleId === 'towerL')
    expect(wall).toBeDefined()
    expect(tower).toBeDefined()
    const events: CastleEvent[] = []
    const applied = damageCell(castle, wall!, 999, events)
    expect(applied).toBeGreaterThan(0)
    expect(wall?.kind).toBe('rubble')
    expect(tower?.falling).toBe(true)
    expect(events.some((event) => event.type === 'destroy')).toBe(true)
    expect(events.some((event) => event.type === 'fall')).toBe(true)
    const fallEvents: CastleEvent[] = []
    updateCastle(castle, 3, fallEvents)
    expect(tower?.kind).toBe('rubble')
    expect(fallEvents.some((event) => event.type === 'land')).toBe(true)
    expect(totalHpPercent(castle)).toBeLessThan(100)
  })

  it('destroys the core and reports zero core health', () => {
    const castle = makeCastle()
    const events: CastleEvent[] = []
    damageCell(castle, castle.core, 999, events)
    expect(castle.core.hp).toBe(0)
    expect(coreHpPercent(castle)).toBe(0)
    expect(events.some((event) => event.type === 'core')).toBe(true)
  })

  it('repairs a damaged module up to its maximum', () => {
    const castle = makeCastle()
    const wall = castle.cells.find((cell) => cell.moduleId === 'wallL1')!
    const events: CastleEvent[] = []
    damageCell(castle, wall, 40, events)
    const afterDamage = wall.hp
    expect(repairCell(wall, 20)).toBe(20)
    expect(wall.hp).toBe(afterDamage + 20)
    expect(repairCell(wall, 9999)).toBeLessThanOrEqual(wall.maxHp - afterDamage)
    expect(wall.hp).toBe(wall.maxHp)
  })

  it('kills a unit and exposes its rectangle', () => {
    const castle = makeCastle()
    const unit = castle.units[0]!
    const rect = cellRect(castle, castle.core)
    expect(rect.w).toBeGreaterThan(0)
    const applied = damageUnit(unit, unit.maxHp)
    expect(applied).toBe(unit.maxHp)
    expect(unit.dead).toBe(true)
  })
})
