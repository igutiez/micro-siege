import {
  CELL,
  MODULES,
  PALETTES,
  STARTING_MODULE_LEVELS,
  UNIT_SLOTS,
  UNITS,
  WORLD,
} from './config.ts'
import {
  applyBattleResult,
  arenaFor,
  claimDaily,
  defaultProfile,
  loadProfile,
  rankFor,
  saveProfile,
  unitUpgradeCost,
  canBuildModule,
  canUpgradeModule,
  moduleBuildCost,
  moduleUpgradeCost,
  spend,
} from './profile.ts'
import { createCastle } from './castle.ts'
import { Battle } from './battle.ts'
import { AudioEngine } from './audio.ts'
import { UI, type BuildTab } from './ui.ts'
import {
  drawBattleScene,
  drawBuildScene,
  drawFloatTexts,
  drawHomeScene,
  drawParticles,
  drawResultOverlay,
} from './art.ts'
import { randomRange, randomInt } from './physics.ts'
import { createInstallController, type InstallController } from '../pwa.ts'
import type {
  BattleHost,
  BattleResult,
  Castle,
  FloatText,
  ModuleId,
  Particle,
  Profile,
  Settings,
  Side,
  UnitId,
} from './types.ts'

export class Game implements BattleHost {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly stage: HTMLElement
  private readonly ui: UI
  private readonly audio = new AudioEngine()
  private install: InstallController | null = null
  private profile: Profile
  private screen: 'home' | 'build' | 'battle' | 'result' = 'home'
  private heroCastle: Castle | null = null
  private buildCastle: Castle | null = null
  private battle: Battle | null = null
  private tab: BuildTab = 'build'
  private selectedModule: ModuleId | null = null
  private hoverModule: ModuleId | null = null
  private unitSlot = 0
  private paused = false
  private speed = 1
  private time = 0
  private fade = 1
  private shakeValue = 0
  private particles: Particle[] = []
  private texts: FloatText[] = []
  private ambientTimer = 0.4
  private lastFrame = 0
  private renderScale = 1
  private renderOffsetX = 0
  private renderOffsetY = 0
  private worldScale = 1
  private worldOffsetX = 0
  private worldOffsetY = 0
  private dragPointer: number | null = null
  private readonly resizeObserver: ResizeObserver | null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D no está disponible')
    this.ctx = ctx
    const stage = document.getElementById('stage')
    if (!stage) throw new Error('Falta el escenario del juego')
    this.stage = stage
    this.profile = loadProfile()
    this.audio.setSound(this.profile.settings.sound)
    this.audio.setMusic(this.profile.settings.music)
    this.applyMotionSetting()
    this.ui = new UI({
      onPlay: () => {
        this.audio.unlock()
        this.startBuild()
      },
      onOpenBuild: () => {
        this.audio.unlock()
        this.startBuild()
      },
      onHome: () => this.startHome(),
      onOpenSettings: () => {
        this.audio.unlock()
        if (this.screen === 'battle') this.paused = true
        this.ui.openSettings(this.profile)
      },
      onCloseSettings: () => {
        this.ui.closeSettings()
        if (this.screen === 'battle' && !this.ui.isPauseOpen) this.paused = false
      },
      onBattle: () => this.startBattle(),
      onFire: () => this.fire(),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onPauseSettings: () => {
        this.audio.unlock()
        this.ui.openSettings(this.profile)
      },
      onQuit: () => this.quitBattle(),
      onSpeed: () => this.toggleSpeed(),
      onSettingsChanged: (settings) => this.updateSettings(settings),
      onReset: () => this.resetProgress(),
      onInstall: () => {
        void this.installApp()
      },
      onDaily: () => this.claimDaily(),
      onTab: (tab) => this.setTab(tab),
      onSelectModule: (id) => this.selectModule(id),
      onBuildModule: (id) => this.buildModule(id),
      onUpgradeModule: (id) => this.upgradeModule(id),
      onSelectUnitSlot: (index) => this.selectUnitSlot(index),
      onEquipUnit: (unit) => this.equipUnit(unit),
      onUnlockUnit: (unit) => this.unlockUnit(unit),
      onUpgradeUnit: (unit) => this.upgradeUnit(unit),
      onResultAgain: () => this.startBattle(),
      onResultBuild: () => this.startBuild(),
      onResultHome: () => this.startHome(),
    })
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => this.resize())
    this.resizeObserver?.observe(this.stage)
    this.canvas.addEventListener('pointerdown', this.pointerDown)
    this.canvas.addEventListener('pointermove', this.pointerMove)
    this.canvas.addEventListener('pointerup', this.pointerUp)
    this.canvas.addEventListener('pointercancel', this.pointerCancel)
    this.canvas.addEventListener('pointerleave', this.pointerLeave)
    window.addEventListener('resize', this.resize)
    window.addEventListener('orientationchange', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('keydown', this.keyDown)
  }

  async boot(): Promise<void> {
    this.resize()
    this.heroCastle = this.makeHeroCastle()
    this.buildCastle = this.makeBuildCastle()
    this.ui.renderHome(this.profile)
    this.ui.showScreen('home')
    this.screen = 'home'
    this.install = createInstallController()
    const updateInstall = (): void => {
      if (!this.install) return
      const ios = this.install.isIos()
      const standalone = this.isStandalone()
      this.ui.setInstallAvailable(this.install.available() || (ios && !standalone))
    }
    this.install.onChange(() => updateInstall())
    this.install.onInstalled(() => {
      this.ui.toast('Micro Siege instalado. Ábrelo desde tu pantalla de inicio.')
      updateInstall()
    })
    updateInstall()
    this.ui.bootDone()
    this.lastFrame = performance.now()
    requestAnimationFrame(this.loop)
  }

  private isStandalone(): boolean {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    return standalone || iosStandalone
  }

  private applyMotionSetting(): void {
    document.body.classList.toggle('reduced-motion', this.profile.settings.reducedMotion)
  }

  private makeHeroCastle(): Castle {
    return createCastle({
      side: 'player',
      x: 790,
      y: 250,
      levels: { ...STARTING_MODULE_LEVELS, towerL: 2, towerR: 2, roof: 1 },
      loadout: ['archer', 'knight', 'bomber', 'mage'],
      unitLevels: { archer: 2, knight: 2, bomber: 1, mage: 1 },
      name: 'MICRO SIEGE',
      trophies: 0,
      palette: PALETTES.dusk,
      scale: 1.15,
    })
  }

  private playerUnitLevels(): Partial<Record<UnitId, number>> {
    const levels: Partial<Record<UnitId, number>> = {}
    for (const unit of UNITS) levels[unit.id] = this.profile.units[unit.id].level
    return levels
  }

  private makeBuildCastle(): Castle {
    const arena = arenaFor(this.profile.trophies)
    return createCastle({
      side: 'player',
      x: 485,
      y: 180,
      levels: this.profile.modules,
      loadout: this.profile.loadout,
      unitLevels: this.playerUnitLevels(),
      name: 'TÚ',
      trophies: this.profile.trophies,
      palette: arena.palette,
      scale: 1.15,
    })
  }

  private refreshBuildCastle(): void {
    this.buildCastle = this.makeBuildCastle()
  }

  private startHome(): void {
    this.battle = null
    this.paused = false
    this.screen = 'home'
    this.fade = 0.85
    this.ui.clearModalState()
    this.ui.renderHome(this.profile)
    this.ui.showScreen('home')
  }

  private startBuild(): void {
    this.battle = null
    this.paused = false
    this.screen = 'build'
    this.tab = 'build'
    this.selectedModule = null
    this.hoverModule = null
    this.unitSlot = 0
    this.fade = 0.85
    this.ui.clearModalState()
    this.refreshBuildCastle()
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.ui.showScreen('build')
  }

  private startBattle(): void {
    this.audio.unlock()
    this.battle = new Battle(this.profile, this)
    this.battle.start()
    this.paused = false
    this.screen = 'battle'
    this.speed = 1
    this.fade = 0.85
    this.ui.clearModalState()
    this.ui.setBattleNames(this.battle)
    this.ui.resetHudCache()
    this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
    this.ui.setSpeed(1)
    this.ui.showScreen('battle')
  }

  private pause(): void {
    if (this.screen !== 'battle' || !this.battle || this.paused) return
    this.paused = true
    this.ui.openPause()
    this.audio.play('ui')
  }

  private resume(): void {
    this.paused = false
    this.ui.closePause()
    this.ui.closeSettings()
    this.audio.play('ui')
  }

  private quitBattle(): void {
    this.paused = false
    this.ui.closePause()
    this.ui.closeSettings()
    this.ui.toast('Has abandonado la batalla.')
    this.startHome()
  }

  private toggleSpeed(): void {
    if (this.screen !== 'battle') return
    this.speed = this.speed === 1 ? 2 : 1
    this.ui.setSpeed(this.speed)
    this.audio.play('ui')
  }

  private fire(): void {
    if (this.screen !== 'battle' || !this.battle || this.paused) return
    this.audio.unlock()
    if (this.battle.firePlayer()) {
      this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
    }
  }

  private updateSettings(settings: Settings): void {
    this.profile.settings = {
      sound: settings.sound,
      music: settings.music,
      reducedMotion: settings.reducedMotion,
      tutorialSeen: this.profile.settings.tutorialSeen,
    }
    this.audio.setSound(settings.sound)
    this.audio.setMusic(settings.music)
    this.applyMotionSetting()
    saveProfile(this.profile)
  }

  private resetProgress(): void {
    this.profile = defaultProfile()
    saveProfile(this.profile)
    this.audio.setSound(true)
    this.audio.setMusic(true)
    this.applyMotionSetting()
    this.heroCastle = this.makeHeroCastle()
    this.startHome()
    this.ui.toast('Progreso borrado. Vuelves al Bronce.')
  }

  private claimDaily(): void {
    const reward = claimDaily(this.profile)
    if (!reward) {
      this.ui.toast('El regalo diario ya está reclamado. Vuelve mañana.')
      return
    }
    this.ui.renderHome(this.profile)
    this.audio.play('coin')
    this.ui.toast(`+${reward.coins} monedas · +${reward.wood} madera`)
  }

  private async installApp(): Promise<void> {
    this.audio.unlock()
    if (!this.install) return
    if (this.install.available()) {
      const accepted = await this.install.prompt()
      if (accepted) this.ui.toast('Instalando Micro Siege…')
      return
    }
    if (this.install.isIos()) {
      this.ui.showIosInstall()
      return
    }
    this.ui.toast('Abre el menú del navegador y elige «Instalar aplicación».')
  }

  private setTab(tab: BuildTab): void {
    this.tab = tab
    if (tab === 'build' && this.selectedModule && this.profile.modules[this.selectedModule] > 0) {
      this.selectedModule = null
    }
    if (tab === 'upgrade' && this.selectedModule && this.profile.modules[this.selectedModule] === 0) {
      this.selectedModule = null
    }
    if (tab === 'units') this.selectedModule = null
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('ui')
  }

  private selectModule(id: ModuleId | null): void {
    if (id === null) {
      this.selectedModule = null
    } else {
      this.selectedModule = this.selectedModule === id ? null : id
      if (this.selectedModule) {
        if (this.profile.modules[id] > 0 && this.tab !== 'upgrade') this.tab = 'upgrade'
        if (this.profile.modules[id] === 0 && this.tab !== 'build') this.tab = 'build'
      }
    }
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('ui')
  }

  private buildModule(id: ModuleId): void {
    if (!canBuildModule(this.profile, id)) {
      this.ui.toast('Primero construye el módulo de apoyo.')
      return
    }
    const cost = moduleBuildCost(id)
    if (!spend(this.profile, cost.coins, cost.wood)) {
      this.ui.toast('No tienes suficientes monedas o madera.')
      return
    }
    this.profile.modules[id] = 1
    saveProfile(this.profile)
    this.refreshBuildCastle()
    this.selectedModule = id
    this.tab = 'upgrade'
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('coin')
    this.ui.toast(`${MODULES.find((module) => module.id === id)?.name ?? 'Módulo'} construido.`)
  }

  private upgradeModule(id: ModuleId): void {
    const level = this.profile.modules[id]
    if (!canUpgradeModule(this.profile, id)) {
      this.ui.toast('Este módulo ya está al máximo.')
      return
    }
    const cost = moduleUpgradeCost(id, level)
    if (!spend(this.profile, cost.coins, cost.wood)) {
      this.ui.toast('No tienes suficientes monedas o madera.')
      return
    }
    this.profile.modules[id] = level + 1
    saveProfile(this.profile)
    this.refreshBuildCastle()
    this.selectedModule = id
    this.tab = 'upgrade'
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('coin')
    this.ui.toast(`Módulo mejorado a nivel ${level + 1}.`)
  }

  private selectUnitSlot(index: number): void {
    this.unitSlot = Math.max(0, Math.min(3, index))
    this.tab = 'units'
    this.selectedModule = null
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('ui')
  }

  private equipUnit(unit: UnitId): void {
    if (!this.profile.units[unit].unlocked) {
      this.ui.toast('Esa unidad todavía está bloqueada.')
      return
    }
    const current = this.profile.loadout[this.unitSlot]
    const next = this.profile.loadout.map((entry) => (entry === unit ? null : entry))
    next[this.unitSlot] = current === unit ? null : unit
    this.profile.loadout = next
    saveProfile(this.profile)
    this.refreshBuildCastle()
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('ui')
    this.ui.toast(current === unit ? 'Unidad retirada.' : `${UNITS.find((entry) => entry.id === unit)?.name ?? 'Unidad'} equipada.`)
  }

  private unlockUnit(unit: UnitId): void {
    const def = UNITS.find((entry) => entry.id === unit)
    if (!def) return
    if (this.profile.units[unit].unlocked) return
    if (this.profile.coins < def.unlock) {
      this.ui.toast(`Necesitas ${def.unlock} monedas para desbloquear a ${def.name}.`)
      return
    }
    this.profile.coins -= def.unlock
    this.profile.units[unit] = { level: 1, unlocked: true }
    saveProfile(this.profile)
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('coin')
    this.ui.toast(`${def.name} desbloqueada.`)
  }

  private upgradeUnit(unit: UnitId): void {
    const state = this.profile.units[unit]
    if (!state.unlocked) return
    if (state.level >= 5) {
      this.ui.toast('Esta unidad ya está al nivel máximo.')
      return
    }
    const cost = unitUpgradeCost(unit, state.level)
    if (this.profile.coins < cost) {
      this.ui.toast(`Necesitas ${cost} monedas para mejorar esta unidad.`)
      return
    }
    this.profile.coins -= cost
    state.level += 1
    saveProfile(this.profile)
    this.refreshBuildCastle()
    this.ui.renderBuild(this.profile, this.selectedModule, this.tab, this.unitSlot)
    this.audio.play('coin')
    this.ui.toast(`Unidad mejorada a nivel ${state.level}.`)
  }

  private resize = (): void => {
    const rect = this.stage.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const scale = rect.width / WORLD.w
    const isWide = rect.width / rect.height > WORLD.w / WORLD.h + 0.005
    this.worldScale = scale
    this.worldOffsetX = 0
    this.worldOffsetY = isWide ? (rect.height - WORLD.h * scale) / 2 : 0
    this.renderScale = scale * dpr
    this.renderOffsetX = this.worldOffsetX * dpr
    this.renderOffsetY = this.worldOffsetY * dpr
    this.ctx.setTransform(this.renderScale, 0, 0, this.renderScale, this.renderOffsetX, this.renderOffsetY)
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
    document.documentElement.style.setProperty('--u', `${scale}px`)
  }

  private pointerWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - this.worldOffsetX) / this.worldScale,
      y: (event.clientY - rect.top - this.worldOffsetY) / this.worldScale,
    }
  }

  private castleLocal(castle: Castle, x: number, y: number): { x: number; y: number } {
    const pivotX = castle.x + (CELL * 5) / 2
    const pivotY = castle.y + CELL * 4
    return {
      x: pivotX + (x - pivotX) / castle.scale,
      y: pivotY + (y - pivotY) / castle.scale,
    }
  }

  private buildModuleAt(x: number, y: number): ModuleId | null {
    if (!this.buildCastle) return null
    const local = this.castleLocal(this.buildCastle, x, y)
    const col = Math.floor((local.x - this.buildCastle.x) / CELL)
    const row = Math.floor((local.y - this.buildCastle.y) / CELL)
    return MODULES.find((module) => module.col === col && module.row === row)?.id ?? null
  }

  private buildUnitSlotAt(x: number, y: number): number | null {
    if (!this.buildCastle) return null
    const local = this.castleLocal(this.buildCastle, x, y)
    let best: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    UNIT_SLOTS.forEach((slot, index) => {
      const sx = this.buildCastle!.x + (slot.col + 0.5) * CELL
      const sy = this.buildCastle!.y + (slot.row + 0.55) * CELL
      const distance = Math.hypot(local.x - sx, local.y - sy)
      if (distance < 30 && distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    return best
  }

  private pointerDown = (event: PointerEvent): void => {
    this.audio.unlock()
    if (this.screen === 'build') {
      const point = this.pointerWorld(event)
      if (this.tab === 'units') {
        const slot = this.buildUnitSlotAt(point.x, point.y)
        if (slot !== null) {
          this.selectUnitSlot(slot)
          return
        }
        return
      }
      const module = this.buildModuleAt(point.x, point.y)
      this.selectModule(module)
      return
    }
    if (this.screen !== 'battle' || !this.battle || this.paused) return
    if (this.battle.phase !== 'fight') return
    this.dragPointer = event.pointerId
    this.canvas.setPointerCapture(event.pointerId)
    this.battle.aim.dragging = true
    const point = this.pointerWorld(event)
    this.battle.aimFromPointer(point.x, point.y)
    this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
    event.preventDefault()
  }

  private pointerMove = (event: PointerEvent): void => {
    if (this.screen === 'build') {
      const point = this.pointerWorld(event)
      const module = this.buildModuleAt(point.x, point.y)
      this.hoverModule = module
      return
    }
    if (this.screen !== 'battle' || !this.battle || this.dragPointer !== event.pointerId) return
    const point = this.pointerWorld(event)
    this.battle.aimFromPointer(point.x, point.y)
    this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
    event.preventDefault()
  }

  private pointerUp = (event: PointerEvent): void => {
    if (this.screen !== 'battle' || !this.battle) return
    if (this.dragPointer !== event.pointerId) return
    this.dragPointer = null
    this.battle.aim.dragging = false
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    if (!this.paused) this.battle.firePlayer()
  }

  private pointerCancel = (event: PointerEvent): void => {
    if (this.dragPointer === event.pointerId) {
      this.dragPointer = null
      if (this.battle) this.battle.aim.dragging = false
    }
  }

  private pointerLeave = (): void => {
    this.hoverModule = null
  }

  private keyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    if (this.ui.isSettingsOpen) {
      if (event.code === 'Escape') {
        this.ui.closeSettings()
        if (this.screen === 'battle' && !this.ui.isPauseOpen) this.paused = false
      }
      return
    }
    if (this.ui.isPauseOpen) {
      if (event.code === 'Escape' || event.code === 'Space') this.resume()
      return
    }
    if (this.screen === 'build' && event.code === 'Escape') {
      this.startHome()
      return
    }
    if (this.screen !== 'battle' || !this.battle) return
    switch (event.code) {
      case 'ArrowUp':
        event.preventDefault()
        this.battle.setAim(this.battle.aim.angle + 2, this.battle.aim.power)
        this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
        break
      case 'ArrowDown':
        event.preventDefault()
        this.battle.setAim(this.battle.aim.angle - 2, this.battle.aim.power)
        this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
        break
      case 'ArrowLeft':
        event.preventDefault()
        this.battle.setAim(this.battle.aim.angle, this.battle.aim.power - 0.05)
        this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
        break
      case 'ArrowRight':
        event.preventDefault()
        this.battle.setAim(this.battle.aim.angle, this.battle.aim.power + 0.05)
        this.ui.setAim(this.battle.aim.angle, this.battle.aim.power)
        break
      case 'Space':
        event.preventDefault()
        this.fire()
        break
      case 'KeyP':
      case 'Escape':
        this.pause()
        break
      case 'KeyS':
        this.toggleSpeed()
        break
      default:
        break
    }
  }

  private onVisibility = (): void => {
    this.lastFrame = performance.now()
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000))
    this.lastFrame = now
    if (!document.hidden) this.update(dt)
    this.render()
    requestAnimationFrame(this.loop)
  }

  private update(dt: number): void {
    this.time += dt
    this.fade = Math.max(0, this.fade - dt * 2.8)
    this.shakeValue = Math.max(0, this.shakeValue - dt * 26)
    this.updateParticles(dt)
    this.updateTexts(dt)
    this.ambientTimer -= dt
    if (this.ambientTimer <= 0) {
      this.spawnAmbient()
      this.ambientTimer = randomRange(0.3, 0.9)
    }
    if (this.screen === 'battle' && this.battle && !this.paused) {
      this.battle.update(dt * this.speed)
      if (this.screen === 'battle') this.ui.renderBattle(this.battle, this.speed)
    }
  }

  private render(): void {
    const ctx = this.ctx
    ctx.setTransform(this.renderScale, 0, 0, this.renderScale, this.renderOffsetX, this.renderOffsetY)
    ctx.clearRect(0, 0, WORLD.w, WORLD.h)
    const shake = this.profile.settings.reducedMotion ? 0 : this.shakeValue
    const sx = shake > 0 ? (Math.random() * 2 - 1) * shake : 0
    const sy = shake > 0 ? (Math.random() * 2 - 1) * shake : 0
    ctx.save()
    ctx.translate(sx, sy)
    if (this.screen === 'home' && this.heroCastle) {
      drawHomeScene(ctx, this.time, this.heroCastle, null)
      drawParticles(ctx, this.particles)
      drawFloatTexts(ctx, this.texts)
    } else if (this.screen === 'build' && this.buildCastle) {
      drawBuildScene(ctx, this.time, this.buildCastle, {
        showSlots: true,
        selected: this.selectedModule,
        hover: this.hoverModule,
        tab: this.tab,
      })
      drawParticles(ctx, this.particles)
      drawFloatTexts(ctx, this.texts)
    } else if ((this.screen === 'battle' || this.screen === 'result') && this.battle) {
      drawBattleScene(ctx, this.time, this.battle)
      drawParticles(ctx, this.particles)
      drawFloatTexts(ctx, this.texts)
      if (this.screen === 'result') drawResultOverlay(ctx)
    } else {
      ctx.fillStyle = '#123a3a'
      ctx.fillRect(0, 0, WORLD.w, WORLD.h)
    }
    ctx.restore()
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(7,19,17,${Math.min(0.85, this.fade)})`
      ctx.fillRect(0, 0, WORLD.w, WORLD.h)
    }
  }

  private updateParticles(dt: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]
      if (!particle) continue
      particle.life -= dt
      if (particle.life <= 0) {
        this.particles.splice(index, 1)
        continue
      }
      particle.vy += particle.gravity * dt
      particle.vx *= 0.995
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.rotation += particle.spin * dt
    }
  }

  private updateTexts(dt: number): void {
    for (let index = this.texts.length - 1; index >= 0; index -= 1) {
      const text = this.texts[index]
      if (!text) continue
      text.life -= dt
      text.y += text.vy * dt
      if (text.life <= 0) this.texts.splice(index, 1)
    }
  }

  private addParticle(particle: Particle): void {
    if (this.particles.length >= 420) this.particles.shift()
    this.particles.push(particle)
  }

  private spawnAmbient(): void {
    if (this.profile.settings.reducedMotion) return
    const palette = this.screen === 'home' ? PALETTES.dusk : this.screen === 'build' ? arenaFor(this.profile.trophies).palette : this.battle?.arena.palette
    if (!palette) return
    const leaf = Math.random() < 0.55
    this.addParticle({
      kind: leaf ? 'leaf' : 'dust',
      x: randomRange(0, WORLD.w),
      y: randomRange(220, 560),
      vx: randomRange(-18, 18),
      vy: randomRange(-18, -5),
      size: leaf ? randomRange(2, 4.5) : randomRange(1, 2.5),
      life: randomRange(2.5, 5),
      maxLife: 5,
      color: leaf ? palette.grass : palette.cloud,
      gravity: leaf ? 8 : -2,
      rotation: randomRange(0, 6.28),
      spin: randomRange(-1.5, 1.5),
      alpha: leaf ? 0.45 : 0.25,
    })
  }

  impact(x: number, y: number, power: number, color: string): void {
    const intensity = Math.max(0.4, Math.min(2, power))
    const count = Math.round(8 + intensity * 9)
    for (let i = 0; i < count; i += 1) {
      const angle = randomRange(-Math.PI, 0)
      const speed = randomRange(30, 140) * intensity
      this.addParticle({
        kind: Math.random() < 0.25 ? 'spark' : Math.random() < 0.5 ? 'dust' : 'smoke',
        x: x + randomRange(-6, 6),
        y: y + randomRange(-6, 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomRange(10, 45),
        size: randomRange(2, 6) * Math.max(0.7, intensity),
        life: randomRange(0.35, 0.9),
        maxLife: 0.9,
        color: Math.random() < 0.3 ? color : Math.random() < 0.5 ? '#d8c7a8' : '#6d6257',
        gravity: -12,
        rotation: randomRange(0, 6.28),
        spin: randomRange(-4, 4),
        alpha: 0.7,
      })
    }
    for (let i = 0; i < Math.round(4 * intensity); i += 1) {
      this.addParticle({
        kind: 'debris',
        x: x + randomRange(-8, 8),
        y: y + randomRange(-8, 8),
        vx: randomRange(-120, 120),
        vy: randomRange(-160, -40),
        size: randomRange(2.5, 6),
        life: randomRange(0.5, 1.1),
        maxLife: 1.1,
        color: Math.random() < 0.5 ? '#cdbfa7' : '#8d7b65',
        gravity: 420,
        rotation: randomRange(0, 6.28),
        spin: randomRange(-8, 8),
        alpha: 0.95,
      })
    }
    this.addParticle({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      size: 10 + intensity * 8,
      life: 0.3,
      maxLife: 0.3,
      color: '#ffe08a',
      gravity: 0,
      rotation: 0,
      spin: 0,
      alpha: 0.6,
    })
    this.shake(intensity * 2.6)
  }

  collapse(x: number, y: number): void {
    for (let i = 0; i < 14; i += 1) {
      this.addParticle({
        kind: Math.random() < 0.5 ? 'dust' : 'smoke',
        x: x + randomRange(-18, 18),
        y: y + randomRange(-18, 18),
        vx: randomRange(-50, 50),
        vy: randomRange(-70, -10),
        size: randomRange(4, 10),
        life: randomRange(0.6, 1.4),
        maxLife: 1.4,
        color: Math.random() < 0.5 ? '#b79b76' : '#75685b',
        gravity: -6,
        rotation: 0,
        spin: randomRange(-1, 1),
        alpha: 0.55,
      })
    }
    this.shake(4)
  }

  muzzle(x: number, y: number, angle: number, side: Side): void {
    const direction = side === 'player' ? 1 : -1
    const radians = (angle * Math.PI) / 180
    const mx = x + Math.cos(radians) * 46 * direction
    const my = y - Math.sin(radians) * 46
    this.addParticle({
      kind: 'star',
      x: mx,
      y: my,
      vx: 0,
      vy: 0,
      size: 18,
      life: 0.14,
      maxLife: 0.14,
      color: '#fff2b8',
      gravity: 0,
      rotation: 0,
      spin: 2,
      alpha: 1,
    })
    for (let i = 0; i < 7; i += 1) {
      const spread = randomRange(-0.4, 0.4)
      this.addParticle({
        kind: 'smoke',
        x: mx,
        y: my,
        vx: Math.cos(radians + spread) * randomRange(20, 70) * direction,
        vy: -Math.sin(radians + spread) * randomRange(20, 70) - 10,
        size: randomRange(3, 8),
        life: randomRange(0.3, 0.8),
        maxLife: 0.8,
        color: '#d7c4a5',
        gravity: -4,
        rotation: 0,
        spin: 0,
        alpha: 0.55,
      })
    }
    this.shake(2)
  }

  dust(x: number, y: number, amount: number, color: string): void {
    for (let i = 0; i < amount; i += 1) {
      this.addParticle({
        kind: 'dust',
        x: x + randomRange(-10, 10),
        y: y + randomRange(-8, 8),
        vx: randomRange(-30, 30),
        vy: randomRange(-30, -5),
        size: randomRange(2, 6),
        life: randomRange(0.4, 1),
        maxLife: 1,
        color,
        gravity: -4,
        rotation: 0,
        spin: 0,
        alpha: 0.6,
      })
    }
  }

  floatText(x: number, y: number, text: string, color: string, size = 18): void {
    this.texts.push({
      x,
      y,
      text,
      color,
      life: 0.9,
      maxLife: 0.9,
      size,
      vy: -34,
    })
    if (this.texts.length > 28) this.texts.shift()
  }

  shake(amount: number): void {
    if (this.profile.settings.reducedMotion) return
    this.shakeValue = Math.min(22, this.shakeValue + amount)
  }

  announce(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    this.ui.announce(text, tone)
  }

  play(name: string, value = 1): void {
    this.audio.play(name, value)
  }

  endBattle(result: BattleResult): void {
    applyBattleResult(this.profile, result)
    saveProfile(this.profile)
    this.screen = 'result'
    this.paused = true
    this.ui.showResult(result, this.profile)
    this.ui.showScreen('result')
    this.audio.play('coin')
  }
}
