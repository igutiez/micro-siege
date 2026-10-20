import { CELL, UNIT_BY_ID } from './config.ts'
import { repairObjective } from './castle.ts'
import { pick, randomRange, unitVelocity } from './physics.ts'
import type { Castle, Cell, Projectile, Unit, UnitDef } from './types.ts'

export interface UnitAction {
  type: 'fire' | 'repair'
  projectile?: Projectile
  cell?: Cell
  amount?: number
}

function projectileRadius(kind: UnitDef['projectile']): number {
  switch (kind) {
    case 'arrow':
    case 'bolt':
      return 3
    case 'bomb':
      return 7
    case 'orb':
      return 8
    case 'boulder':
      return 9
    default:
      return 5
  }
}

function chooseStructure(castle: Castle): Cell | undefined {
  const structures = castle.cells.filter(
    (cell) =>
      (cell.kind === 'wall' || cell.kind === 'tower' || cell.kind === 'base' || cell.kind === 'roof' || cell.kind === 'core') &&
      cell.hp > 0 &&
      !cell.falling,
  )
  if (structures.length === 0) return undefined
  const core = structures.find((cell) => cell.kind === 'core')
  if (core && Math.random() < 0.18) return core
  return pick(structures)
}

function chooseTarget(castle: Castle, preferUnits: boolean): { x: number; y: number } | undefined {
  const units = castle.units.filter((unit) => !unit.dead)
  if (preferUnits && units.length > 0) {
    const unit = pick(units)
    return { x: unit.x + randomRange(-8, 8), y: unit.y - 18 + randomRange(-5, 5) }
  }
  const structure = chooseStructure(castle)
  if (!structure) {
    if (units.length > 0) {
      const unit = pick(units)
      return { x: unit.x, y: unit.y - 18 }
    }
    return undefined
  }
  return {
    x: castle.x + (structure.col + 0.5) * CELL + randomRange(-7, 7),
    y: castle.y + (structure.row + 0.5) * CELL + randomRange(-7, 7),
  }
}

export function unitDef(unit: Unit): UnitDef {
  return UNIT_BY_ID[unit.kind]
}

export function unitDamage(unit: Unit): number {
  const def = unitDef(unit)
  return Math.round((def.damage + def.damagePerLevel * (unit.level - 1)) * 10) / 10
}

export function updateUnitCombat(
  unit: Unit,
  ownCastle: Castle,
  enemyCastle: Castle,
  wind: number,
  dt: number,
): UnitAction | null {
  if (unit.dead) return null
  const def = unitDef(unit)
  unit.attackTimer += dt
  unit.cooldown -= dt
  if (unit.cooldown > 0) return null

  if (def.id === 'engineer') {
    const target = repairObjective(ownCastle)
    unit.cooldown = def.cooldown * randomRange(0.85, 1.15)
    unit.recoil = 1
    if (!target) return null
    return { type: 'repair', cell: target, amount: 12 + unit.level * 6 }
  }

  const preferUnits = def.id === 'archer' || def.id === 'ranger' || def.id === 'mage' || def.id === 'knight'
  const target = chooseTarget(enemyCastle, preferUnits)
  if (!target) return null

  const origin = { x: unit.x, y: unit.y - 24 }
  const velocity = unitVelocity(origin, target, def.speed, def.gravity, wind)
  const damage = unitDamage(unit)
  unit.cooldown = def.cooldown * randomRange(0.88, 1.12)
  unit.recoil = 1
  return {
    type: 'fire',
    projectile: {
      id: 0,
      side: unit.side,
      kind: def.projectile,
      x: origin.x,
      y: origin.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: projectileRadius(def.projectile),
      damage,
      gravity: def.gravity,
      windFactor: def.projectile === 'arrow' || def.projectile === 'bolt' ? 0.35 : 1,
      splash: def.splash,
      color: def.accent,
      trail: [],
      life: 0,
      maxLife: 6,
      source: 'unit',
    },
  }
}

export function unitKillScore(unit: Unit): number {
  return Math.round(unit.maxHp + unitDamage(unit) * 4)
}
