import {
  BATTLE_TIME,
  CASTLE_W,
  CASTLE_Y,
  CELL,
  GRAVITY,
  PLAYER_X,
  WIND_ACCEL,
  WORLD,
} from './config.ts'
import {
  aliveUnits,
  cannonPosition,
  cellCenter,
  cellRect,
  coreHpPercent,
  createCastle,
  damageCell,
  damageUnit,
  isStructural,
  moduleCell,
  repairCell,
  totalHpPercent,
  unitRect,
  updateCastle,
  type CastleEvent,
} from './castle.ts'
import { arenaFor, makeAi, rewardFor, totalModuleLevels } from './profile.ts'
import { clamp, cannonVelocity, randomRange, randomWind, solveCannonAim, simulateTrajectory } from './physics.ts'
import { updateUnitCombat, type UnitAction } from './units.ts'
import type {
  AimState,
  ArenaDef,
  BattleHost,
  BattleResult,
  BattleStats,
  Castle,
  Cell,
  Profile,
  Projectile,
  Side,
  Unit,
  UnitId,
} from './types.ts'

export class Battle {
  readonly player: Castle
  readonly enemy: Castle
  readonly arena: ArenaDef
  readonly host: BattleHost
  readonly aim: AimState = { angle: 45, power: 0.65, dragging: false }
  readonly projectiles: Projectile[] = []
  readonly stats: BattleStats = { shots: 0, hits: 0, damage: 0, unitsLost: 0, swaps: 0 }
  wind: number
  windTimer = 10
  timeLeft = BATTLE_TIME
  elapsed = 0
  phase: 'intro' | 'fight' | 'over' = 'intro'
  introTime = 0
  endTimer = 1.35
  cooldown = 0
  aiTimer = 2.4
  result: BattleResult | null = null
  readonly playerDamage: number
  readonly enemyDamage: number
  private readonly ai
  private reported = false
  private nextProjectileId = 1

  constructor(profile: Profile, host: BattleHost) {
    this.host = host
    this.arena = arenaFor(profile.trophies)
    this.ai = makeAi(profile)
    this.wind = randomWind()
    this.playerDamage = 32 + totalModuleLevels(profile.modules) * 1.1
    this.enemyDamage = 32 + (this.ai.unitLevel - 1) * 5

    const playerUnitLevels: Partial<Record<UnitId, number>> = {}
    for (const [id, state] of Object.entries(profile.units)) {
      playerUnitLevels[id as UnitId] = state.level
    }

    const enemyUnitLevels: Partial<Record<UnitId, number>> = {}
    for (const unit of this.ai.loadout) enemyUnitLevels[unit] = this.ai.unitLevel

    this.player = createCastle({
      side: 'player',
      x: PLAYER_X,
      y: CASTLE_Y,
      levels: profile.modules,
      loadout: profile.loadout,
      unitLevels: playerUnitLevels,
      name: 'TÚ',
      trophies: profile.trophies,
      palette: this.arena.palette,
    })

    this.enemy = createCastle({
      side: 'enemy',
      x: WORLD.w - PLAYER_X - CASTLE_W,
      y: CASTLE_Y,
      levels: this.ai.levels,
      loadout: this.ai.loadout,
      unitLevels: enemyUnitLevels,
      name: this.ai.name,
      trophies: this.ai.trophies,
      palette: this.arena.palette,
    })

    this.player.cannonAngle = this.aim.angle
    this.enemy.cannonAngle = 42
  }

  start(): void {
    this.phase = 'intro'
    this.introTime = 0
  }

  update(dt: number): void {
    if (this.phase === 'over') {
      this.updateAfterBattle(dt)
      return
    }

    if (this.phase === 'intro') {
      this.introTime += dt
      if (this.introTime >= 1.45) this.phase = 'fight'
      return
    }

    this.elapsed += dt
    this.timeLeft = Math.max(0, this.timeLeft - dt)
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.aiTimer -= dt
    this.windTimer -= dt
    this.player.cannonRecoil = Math.max(0, this.player.cannonRecoil - dt * 3.4)
    this.enemy.cannonRecoil = Math.max(0, this.enemy.cannonRecoil - dt * 3.4)
    this.player.cannonFlash = Math.max(0, this.player.cannonFlash - dt)
    this.enemy.cannonFlash = Math.max(0, this.enemy.cannonFlash - dt)

    if (this.windTimer <= 0) {
      this.wind = randomWind()
      this.windTimer = randomRange(9, 13)
      this.stats.swaps += 1
      this.host.announce('EL VIENTO CAMBIA', 'neutral')
      this.host.play('wind')
    }

    const playerEvents: CastleEvent[] = []
    updateCastle(this.player, dt, playerEvents)
    this.processEvents('player', playerEvents)

    const enemyEvents: CastleEvent[] = []
    updateCastle(this.enemy, dt, enemyEvents)
    this.processEvents('enemy', enemyEvents)

    this.updateUnits(dt)
    this.updateProjectiles(dt)

    if (this.aiTimer <= 0) {
      this.enemyFire()
      this.aiTimer = this.ai.delay * randomRange(0.86, 1.16)
    }

    this.checkEnd()
  }

  private updateAfterBattle(dt: number): void {
    const events: CastleEvent[] = []
    updateCastle(this.player, dt, events)
    this.processEvents('player', events)
    const enemyEvents: CastleEvent[] = []
    updateCastle(this.enemy, dt, enemyEvents)
    this.processEvents('enemy', enemyEvents)
    this.endTimer -= dt
    if (this.endTimer <= 0 && this.result && !this.reported) {
      this.reported = true
      this.host.endBattle(this.result)
    }
  }

  private processEvents(side: Side, events: CastleEvent[]): void {
    const castle = side === 'player' ? this.player : this.enemy
    for (const event of events) {
      switch (event.type) {
        case 'damage':
          if ((event.amount ?? 0) > 8) this.host.dust(event.x, event.y, 2, '#d8c7a8')
          break
        case 'destroy':
          this.host.impact(event.x, event.y, 1.25, castle.palette.accent)
          this.host.collapse(event.x, event.y)
          this.host.play('collapse')
          this.host.shake(4)
          break
        case 'fall':
          this.host.collapse(event.x, event.y)
          this.host.play('collapse', 0.7)
          this.host.shake(3)
          break
        case 'land':
          this.host.dust(event.x, event.y + 12, 10, '#b79b76')
          this.host.play('land')
          this.host.shake(4)
          this.damageUnitsNear(castle, event.x, event.y)
          break
        case 'core':
          this.host.shake(12)
          this.host.play('core')
          this.host.announce(
            side === 'enemy' ? '¡CASTILLO ENEMIGO DERRIBADO!' : '¡TU NÚCLEO HA CAÍDO!',
            side === 'enemy' ? 'good' : 'bad',
          )
          break
      }
    }
  }

  private damageUnitsNear(castle: Castle, x: number, y: number): void {
    for (const unit of castle.units) {
      if (unit.dead) continue
      if (Math.abs(unit.x - x) > 64 || Math.abs(unit.y - y) > 80) continue
      const wasDead = unit.dead
      damageUnit(unit, 28)
      this.host.floatText(unit.x, unit.y - 44, '28', '#ffcf5c', 13)
      if (!wasDead && unit.dead && unit.side === 'player') this.stats.unitsLost += 1
    }
  }

  private updateUnits(dt: number): void {
    for (const unit of this.player.units) {
      if (unit.dead) continue
      const action = updateUnitCombat(unit, this.player, this.enemy, this.wind, dt)
      if (action) this.handleUnitAction(unit, action)
    }
    for (const unit of this.enemy.units) {
      if (unit.dead) continue
      const action = updateUnitCombat(unit, this.enemy, this.player, this.wind, dt)
      if (action) this.handleUnitAction(unit, action)
    }
  }

  private handleUnitAction(unit: Unit, action: UnitAction): void {
    if (action.type === 'repair' && action.cell) {
      const healed = repairCell(action.cell, action.amount ?? 10)
      if (healed > 0) {
        this.host.floatText(unit.x, unit.y - 38, `+${Math.round(healed)}`, '#9bf0a7', 14)
        this.host.dust(unit.x, unit.y - 20, 3, '#9bf0a7')
        this.host.play('repair')
      }
      return
    }
    if (action.projectile) {
      const projectile = { ...action.projectile, id: this.nextProjectileId++ }
      this.projectiles.push(projectile)
      this.host.play(
        projectile.kind === 'bomb' ? 'bomb' : projectile.kind === 'boulder' ? 'siege' : 'arrow',
      )
    }
  }

  private updateProjectiles(dt: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]
      if (!projectile) continue
      const speed = Math.hypot(projectile.vx, projectile.vy)
      const steps = Math.max(1, Math.ceil((speed * dt) / 6))
      const step = dt / steps
      let remove = false

      for (let s = 0; s < steps; s += 1) {
        projectile.vy += projectile.gravity * step
        projectile.vx += this.wind * WIND_ACCEL * projectile.windFactor * step
        projectile.x += projectile.vx * step
        projectile.y += projectile.vy * step
        projectile.life += step

        const last = projectile.trail[projectile.trail.length - 1]
        if (!last || Math.hypot(last.x - projectile.x, last.y - projectile.y) > 7) {
          projectile.trail.push({ x: projectile.x, y: projectile.y })
          if (projectile.trail.length > 14) projectile.trail.shift()
        }

        const target = projectile.side === 'player' ? this.enemy : this.player
        const hitCell = this.firstCellHit(target, projectile)
        const hitUnit = hitCell ? undefined : this.firstUnitHit(target, projectile)
        if (hitCell) {
          this.resolveCellHit(projectile, target, hitCell)
          remove = true
          break
        }
        if (hitUnit) {
          this.resolveUnitHit(projectile, hitUnit)
          remove = true
          break
        }
        if (projectile.y >= WORLD.h - 86) {
          this.resolveGroundHit(projectile)
          remove = true
          break
        }
        if (projectile.x < -120 || projectile.x > WORLD.w + 120 || projectile.y < -300) {
          remove = true
          break
        }
      }

      if (remove || projectile.life >= projectile.maxLife) this.projectiles.splice(index, 1)
    }
  }

  private firstCellHit(target: Castle, projectile: Projectile): Cell | undefined {
    let best: Cell | undefined
    let bestDistance = Number.POSITIVE_INFINITY
    for (const cell of target.cells) {
      if (!isStructural(cell) || cell.hp <= 0) continue
      const rect = cellRect(target, cell)
      if (
        projectile.x + projectile.radius >= rect.x &&
        projectile.x - projectile.radius <= rect.x + rect.w &&
        projectile.y + projectile.radius >= rect.y &&
        projectile.y - projectile.radius <= rect.y + rect.h
      ) {
        const center = cellCenter(target, cell)
        const distance = Math.hypot(center.x - projectile.x, center.y - projectile.y)
        if (distance < bestDistance) {
          bestDistance = distance
          best = cell
        }
      }
    }
    return best
  }

  private firstUnitHit(target: Castle, projectile: Projectile): Unit | undefined {
    for (const unit of target.units) {
      if (unit.dead) continue
      const rect = unitRect(unit)
      if (
        projectile.x + projectile.radius >= rect.x &&
        projectile.x - projectile.radius <= rect.x + rect.w &&
        projectile.y + projectile.radius >= rect.y &&
        projectile.y - projectile.radius <= rect.y + rect.h
      ) {
        return unit
      }
    }
    return undefined
  }

  private resolveCellHit(projectile: Projectile, target: Castle, cell: Cell): void {
    const wasCore = cell === target.core
    const events: CastleEvent[] = []
    const applied = damageCell(target, cell, projectile.damage, events)
    this.processEvents(target.side, events)
    if (projectile.side === 'player') {
      if (projectile.source === 'cannon') this.stats.hits += 1
      this.stats.damage += applied
    }
    this.host.impact(projectile.x, projectile.y, projectile.damage / 28, projectile.color)
    this.host.shake(projectile.damage > 26 ? 5 : 3)
    this.host.play('impact', projectile.damage / 30)
    if (projectile.splash > 0) this.splashDamage(target, projectile)
    if (wasCore) this.host.announce('¡NÚCLEO TOCADO!', 'good')
  }

  private splashDamage(target: Castle, projectile: Projectile): void {
    const events: CastleEvent[] = []
    const radius = projectile.splash
    for (const cell of target.cells) {
      if (!isStructural(cell) || cell.hp <= 0) continue
      const center = cellCenter(target, cell)
      const distance = Math.hypot(center.x - projectile.x, center.y - projectile.y)
      if (distance > radius || distance < 8) continue
      const factor = 1 - distance / radius
      damageCell(target, cell, projectile.damage * 0.4 * factor, events)
    }
    this.processEvents(target.side, events)
    for (const unit of target.units) {
      if (unit.dead) continue
      const distance = Math.hypot(unit.x - projectile.x, unit.y - 18 - projectile.y)
      if (distance > radius) continue
      const wasDead = unit.dead
      damageUnit(unit, projectile.damage * 0.5 * (1 - distance / radius))
      this.host.floatText(unit.x, unit.y - 44, '¡IMPACTO!', '#ffcf5c', 11)
      if (!wasDead && unit.dead && target.side === 'player') this.stats.unitsLost += 1
    }
  }

  private resolveUnitHit(projectile: Projectile, unit: Unit): void {
    const wasDead = unit.dead
    const applied = damageUnit(unit, projectile.damage)
    this.host.floatText(unit.x, unit.y - 44, `${Math.round(applied)}`, '#ffcf5c', 13)
    this.host.impact(unit.x, unit.y - 18, 0.7, projectile.color)
    this.host.play('hit')
    if (!wasDead && unit.dead && unit.side === 'enemy' && projectile.side === 'player') {
      this.host.floatText(unit.x, unit.y - 58, '¡UNIDAD CAÍDA!', '#ffe08a', 13)
    }
    if (!wasDead && unit.dead && unit.side === 'player') this.stats.unitsLost += 1
    if (projectile.side === 'player') {
      if (projectile.source === 'cannon') this.stats.hits += 1
      this.stats.damage += applied
    }
    if (projectile.splash > 0) {
      this.splashDamage(projectile.side === 'player' ? this.enemy : this.player, projectile)
    }
  }

  private resolveGroundHit(projectile: Projectile): void {
    this.host.impact(projectile.x, WORLD.h - 86, 0.5, projectile.color)
    this.host.dust(projectile.x, WORLD.h - 86, 4, '#b79b76')
  }

  private enemyFire(): void {
    if (this.phase !== 'fight') return
    const target = this.chooseAiTarget()
    if (!target) return
    const from = cannonPosition(this.enemy)
    const mirroredFrom = { x: WORLD.w - from.x, y: from.y }
    const mirroredTarget = { x: WORLD.w - target.x, y: target.y }
    const solution = solveCannonAim(mirroredFrom, mirroredTarget, -this.wind, WORLD.h - 86)
    const angle = clamp(solution.angle + randomRange(-1, 1) * this.ai.error * 55, 8, 82)
    const power = clamp(solution.power + randomRange(-1, 1) * this.ai.error * 0.45, 0.2, 1)
    const velocity = cannonVelocity(angle, power)
    this.enemy.cannonAngle = angle
    this.enemy.cannonRecoil = 1
    this.enemy.cannonFlash = 0.16
    this.projectiles.push({
      id: this.nextProjectileId++,
      side: 'enemy',
      kind: 'cannon',
      x: from.x,
      y: from.y,
      vx: -velocity.x,
      vy: velocity.y,
      radius: 9,
      damage: this.enemyDamage,
      gravity: GRAVITY,
      windFactor: 1,
      splash: 34,
      color: '#ffb27a',
      trail: [],
      life: 0,
      maxLife: 8,
      source: 'cannon',
    })
    this.host.muzzle(from.x, from.y, angle, 'enemy')
    this.host.play('cannon', 0.8)
    this.host.shake(2)
  }

  private chooseAiTarget(): { x: number; y: number } | undefined {
    const units = aliveUnits(this.player)
    if (units.length > 0 && Math.random() < 0.28) {
      const unit = units[Math.floor(Math.random() * units.length)]
      if (unit) return { x: unit.x + randomRange(-10, 10), y: unit.y - 18 + randomRange(-5, 5) }
    }
    const structures = this.player.cells.filter((cell) => isStructural(cell) && cell.hp > 0 && !cell.falling)
    if (structures.length === 0) return undefined
    const roof = moduleCell(this.player, 'roof')
    const roofOpen = !roof || roof.hp <= 0
    const core = this.player.core
    if (roofOpen && core.hp > 0 && Math.random() < 0.48) {
      return {
        x: this.player.x + (core.col + 0.5) * CELL + randomRange(-6, 6),
        y: this.player.y + (core.row + 0.5) * CELL,
      }
    }
    const cell = structures[Math.floor(Math.random() * structures.length)]
    if (!cell) return undefined
    return {
      x: this.player.x + (cell.col + 0.5) * CELL + randomRange(-5, 5),
      y: this.player.y + (cell.row + 0.5) * CELL + randomRange(-5, 5),
    }
  }

  firePlayer(): boolean {
    if (this.phase !== 'fight' || this.cooldown > 0) return false
    const from = cannonPosition(this.player)
    const velocity = cannonVelocity(this.aim.angle, this.aim.power)
    this.player.cannonAngle = this.aim.angle
    this.player.cannonRecoil = 1
    this.player.cannonFlash = 0.16
    this.projectiles.push({
      id: this.nextProjectileId++,
      side: 'player',
      kind: 'cannon',
      x: from.x,
      y: from.y,
      vx: velocity.x,
      vy: velocity.y,
      radius: 9,
      damage: this.playerDamage,
      gravity: GRAVITY,
      windFactor: 1,
      splash: 38,
      color: '#ffe08a',
      trail: [],
      life: 0,
      maxLife: 8,
      source: 'cannon',
    })
    this.cooldown = 2.05
    this.stats.shots += 1
    this.host.muzzle(from.x, from.y, this.aim.angle, 'player')
    this.host.play('cannon')
    this.host.shake(4)
    return true
  }

  setAim(angle: number, power: number): void {
    this.aim.angle = clamp(angle, 8, 82)
    this.aim.power = clamp(power, 0.12, 1)
    this.player.cannonAngle = this.aim.angle
  }

  aimFromPointer(x: number, y: number): void {
    const cannon = cannonPosition(this.player)
    const dx = x - cannon.x
    const dy = cannon.y - y
    if (dx <= 6) {
      this.setAim(82, clamp(Math.hypot(dx, dy) / 470, 0.2, 1))
      return
    }
    const angle = (Math.atan2(Math.max(0, dy), dx) * 180) / Math.PI
    const power = clamp(Math.hypot(dx, dy) / 470, 0.2, 1)
    this.setAim(angle, power)
  }

  preview(): Array<{ x: number; y: number }> {
    return simulateTrajectory(cannonPosition(this.player), this.aim.angle, this.aim.power, this.wind, {
      groundY: WORLD.h - 86,
      maxTime: 4,
    })
  }

  private checkEnd(): void {
    if (this.phase === 'over') return
    if (this.enemy.core.hp <= 0) {
      this.finish(true, 'core')
      return
    }
    if (this.player.core.hp <= 0) {
      this.finish(false, 'core')
      return
    }
    if (this.timeLeft <= 0) {
      const playerScore = totalHpPercent(this.player)
      const enemyScore = totalHpPercent(this.enemy)
      this.finish(playerScore >= enemyScore, 'timer')
    }
  }

  private finish(win: boolean, reason: 'core' | 'timer'): void {
    if (this.phase === 'over') return
    this.phase = 'over'
    const reward = rewardFor(win)
    this.result = {
      win,
      reason,
      coins: reward.coins,
      wood: reward.wood,
      trophies: reward.trophies,
      damage: Math.round(this.stats.damage),
      shots: this.stats.shots,
      hits: this.stats.hits,
      time: Math.round(BATTLE_TIME - this.timeLeft),
      enemyName: this.enemy.name,
      playerHp: Math.round(coreHpPercent(this.player)),
      enemyHp: Math.round(coreHpPercent(this.enemy)),
    }
    this.endTimer = 1.35
    this.host.play(win ? 'win' : 'lose')
    this.host.announce(
      reason === 'core' ? (win ? '¡VICTORIA!' : 'DERROTA') : win ? '¡TIEMPO! GANAS POR PUNTOS' : '¡TIEMPO! PIERDES POR PUNTOS',
      win ? 'good' : 'bad',
    )
    this.host.shake(win ? 7 : 10)
  }

  get playerHp(): number {
    return coreHpPercent(this.player)
  }

  get enemyHp(): number {
    return coreHpPercent(this.enemy)
  }

  get playerCannon(): { x: number; y: number } {
    return cannonPosition(this.player)
  }

  get enemyCannon(): { x: number; y: number } {
    return cannonPosition(this.enemy)
  }

  get windLabel(): string {
    if (Math.abs(this.wind) < 0.12) return 'CALMA'
    return this.wind > 0 ? '→' : '←'
  }
}
