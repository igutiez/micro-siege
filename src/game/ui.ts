import {
  MODULES,
  MODULE_BY_ID,
  UNITS,
  UNIT_BY_ID,
} from './config.ts'
import {
  arenaFor,
  canBuildModule,
  canUpgradeModule,
  dailyAvailable,
  formatNumber,
  moduleBuildCost,
  moduleUpgradeCost,
  rankFor,
  unitUpgradeCost,
} from './profile.ts'
import { formatClock } from './physics.ts'
import { drawUnitPortrait } from './art.ts'
import type { Battle } from './battle.ts'
import type { BattleResult, ModuleId, Profile, Settings, UnitId } from './types.ts'

export type BuildTab = 'build' | 'upgrade' | 'units'

export interface UICallbacks {
  onPlay(): void
  onOpenBuild(): void
  onHome(): void
  onOpenSettings(): void
  onCloseSettings(): void
  onBattle(): void
  onFire(): void
  onPause(): void
  onResume(): void
  onPauseSettings(): void
  onQuit(): void
  onSpeed(): void
  onSettingsChanged(settings: Settings): void
  onReset(): void
  onInstall(): void
  onDaily(): void
  onTab(tab: BuildTab): void
  onSelectModule(id: ModuleId | null): void
  onBuildModule(id: ModuleId): void
  onUpgradeModule(id: ModuleId): void
  onSelectUnitSlot(index: number): void
  onEquipUnit(unit: UnitId): void
  onUnlockUnit(unit: UnitId): void
  onUpgradeUnit(unit: UnitId): void
  onResultAgain(): void
  onResultBuild(): void
  onResultHome(): void
}

const ICONS: Record<string, string> = {
  coin: 'i-coin',
  wood: 'i-wood',
  crown: 'i-crown',
  trophy: 'i-trophy',
  gear: 'i-gear',
  home: 'i-home',
  play: 'i-play',
  pause: 'i-pause',
  sound: 'i-sound',
  music: 'i-music',
  lock: 'i-lock',
  arrow: 'i-arrow',
  check: 'i-check',
  close: 'i-close',
  rotate: 'i-rotate',
  install: 'i-install',
  bolt: 'i-bolt',
  shield: 'i-shield',
  fire: 'i-fire',
  flag: 'i-flag',
}

function icon(name: keyof typeof ICONS): string {
  return `<svg class="icon" aria-hidden="true"><use href="#${ICONS[name]}" /></svg>`
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing element #${id}`)
  return found as T
}

function moduleGlyph(id: ModuleId): string {
  if (id === 'towerL' || id === 'towerR') return '♜'
  if (id === 'roof') return '⌂'
  if (id === 'baseL' || id === 'baseR') return '▤'
  return '▦'
}

function costLine(wood: number, coins: number): string {
  return `<span class="cost">${icon('wood')} ${formatNumber(wood)} · ${icon('coin')} ${formatNumber(coins)}</span>`
}

export class UI {
  private readonly callbacks: UICallbacks
  private toastTimer: number | null = null
  private announceTimer: number | null = null
  private installAvailable = false
  private lastUnitKey = ''
  private lastHud = {
    playerHp: -1,
    enemyHp: -1,
    timer: '',
    wind: '',
    power: -1,
    angle: -1,
    cooldown: -1,
    fireLabel: 'DISPARAR',
    speed: 0,
    phase: '',
    hint: '',
  }

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks
    this.bind()
  }

  private bind(): void {
    el<HTMLButtonElement>('btn-play').addEventListener('click', () => this.callbacks.onPlay())
    el<HTMLButtonElement>('btn-build-home').addEventListener('click', () => this.callbacks.onOpenBuild())
    el<HTMLButtonElement>('btn-home-settings').addEventListener('click', () => this.callbacks.onOpenSettings())
    el<HTMLButtonElement>('btn-build-back').addEventListener('click', () => this.callbacks.onHome())
    el<HTMLButtonElement>('btn-battle').addEventListener('click', () => this.callbacks.onBattle())
    el<HTMLButtonElement>('btn-fire').addEventListener('click', () => this.callbacks.onFire())
    el<HTMLButtonElement>('btn-pause').addEventListener('click', () => this.callbacks.onPause())
    el<HTMLButtonElement>('btn-speed').addEventListener('click', () => this.callbacks.onSpeed())
    el<HTMLButtonElement>('btn-resume').addEventListener('click', () => this.callbacks.onResume())
    el<HTMLButtonElement>('btn-pause-settings').addEventListener('click', () => this.callbacks.onPauseSettings())
    el<HTMLButtonElement>('btn-quit').addEventListener('click', () => this.callbacks.onQuit())
    el<HTMLButtonElement>('btn-result-again').addEventListener('click', () => this.callbacks.onResultAgain())
    el<HTMLButtonElement>('btn-result-build').addEventListener('click', () => this.callbacks.onResultBuild())
    el<HTMLButtonElement>('btn-result-home').addEventListener('click', () => this.callbacks.onResultHome())
    el<HTMLButtonElement>('btn-install').addEventListener('click', () => this.callbacks.onInstall())
    el<HTMLButtonElement>('btn-install-settings').addEventListener('click', () => this.callbacks.onInstall())

    const settings = el<HTMLDivElement>('modal-settings')
    const pause = el<HTMLDivElement>('modal-pause')
    for (const close of document.querySelectorAll<HTMLButtonElement>('[data-close-modal]')) {
      close.addEventListener('click', () => {
        const modal = close.closest<HTMLElement>('.modal')
        if (!modal) return
        modal.classList.remove('open')
        if (modal.id === 'modal-settings') this.callbacks.onCloseSettings()
      })
    }
    settings.addEventListener('click', (event) => {
      if (event.target === settings) {
        this.closeSettings()
        this.callbacks.onCloseSettings()
      }
    })
    pause.addEventListener('click', (event) => {
      if (event.target === pause) this.callbacks.onResume()
    })

    for (const tab of document.querySelectorAll<HTMLButtonElement>('.sheet-tab')) {
      tab.addEventListener('click', () => {
        const value = tab.dataset.tab
        if (value === 'build' || value === 'upgrade' || value === 'units') this.callbacks.onTab(value)
      })
    }

    el<HTMLDivElement>('build-sheet-body').addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return
      const action = target.dataset.action
      const moduleId = target.dataset.module as ModuleId | undefined
      const unitId = target.dataset.unit as UnitId | undefined
      const slot = target.dataset.slot
      if (action === 'select' && moduleId) this.callbacks.onSelectModule(moduleId)
      if (action === 'build' && moduleId) this.callbacks.onBuildModule(moduleId)
      if (action === 'upgrade' && moduleId) this.callbacks.onUpgradeModule(moduleId)
      if (action === 'unit-slot' && slot) this.callbacks.onSelectUnitSlot(Number(slot))
      if (action === 'equip' && unitId) this.callbacks.onEquipUnit(unitId)
      if (action === 'unlock' && unitId) this.callbacks.onUnlockUnit(unitId)
      if (action === 'unit-upgrade' && unitId) this.callbacks.onUpgradeUnit(unitId)
    })

    el<HTMLDivElement>('home-stats').addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action="daily"]')
      if (target) this.callbacks.onDaily()
    })

    for (const input of [
      el<HTMLInputElement>('set-sound'),
      el<HTMLInputElement>('set-music'),
      el<HTMLInputElement>('set-motion'),
    ]) {
      input.addEventListener('change', () => {
        this.callbacks.onSettingsChanged({
          sound: el<HTMLInputElement>('set-sound').checked,
          music: el<HTMLInputElement>('set-music').checked,
          reducedMotion: el<HTMLInputElement>('set-motion').checked,
          tutorialSeen: true,
        })
      })
    }

    el<HTMLButtonElement>('btn-reset').addEventListener('click', () => {
      if (window.confirm('¿Borrar el progreso, las monedas y los upgrades de este dispositivo?')) {
        this.callbacks.onReset()
      }
    })
  }

  bootDone(): void {
    const boot = document.getElementById('boot')
    if (!boot) return
    boot.classList.add('done')
    window.setTimeout(() => boot.remove(), 650)
  }

  showScreen(id: 'home' | 'build' | 'battle' | 'result'): void {
    for (const screen of document.querySelectorAll<HTMLElement>('.screen')) {
      screen.classList.toggle('active', screen.dataset.screen === id)
    }
  }

  renderHome(profile: Profile): void {
    this.renderWallet(profile)
    const rank = rankFor(profile.trophies)
    el<HTMLDivElement>('home-rank').className = `rank-chip ${rank.id}`
    el<HTMLDivElement>('home-rank').innerHTML = `${icon('crown')} ${rank.name} · ${formatNumber(profile.trophies)}`
    const daily = dailyAvailable(profile)
    el<HTMLDivElement>('home-stats').innerHTML = [
      `<span class="stat-pill">${profile.wins} V · ${profile.losses} D</span>`,
      `<span class="stat-pill">${arenaFor(profile.trophies).name}</span>`,
      daily
        ? `<button class="btn btn-green daily-btn" data-action="daily">${icon('coin')} REGALO DIARIO</button>`
        : '',
    ].join('')
    this.setInstallVisible(this.installAvailable)
  }

  renderWallet(profile: Profile): void {
    const html = `<span class="wallet-item coin">${icon('coin')}<b>${formatNumber(profile.coins)}</b></span><span class="wallet-item wood">${icon('wood')}<b>${formatNumber(profile.wood)}</b></span>`
    for (const wallet of document.querySelectorAll<HTMLElement>('[data-wallet]')) wallet.innerHTML = html
  }

  renderBuild(profile: Profile, selected: ModuleId | null, tab: BuildTab, unitSlot: number): void {
    this.renderWallet(profile)
    el<HTMLElement>('build-rank-name').textContent = rankFor(profile.trophies).name
    for (const tabButton of document.querySelectorAll<HTMLButtonElement>('.sheet-tab')) {
      tabButton.classList.toggle('active', tabButton.dataset.tab === tab)
    }
    const hint = el<HTMLElement>('build-hint')
    if (tab === 'build') hint.textContent = 'Toca una ranura punteada para construir.'
    else if (tab === 'upgrade') hint.textContent = 'Toca un módulo construido para mejorarlo.'
    else hint.textContent = 'Elige una unidad y colócala en una ranura.'

    const body = el<HTMLDivElement>('build-sheet-body')
    if (tab === 'units') {
      body.innerHTML = this.unitsPanel(profile, unitSlot)
      return
    }

    if (tab === 'build') {
      if (selected && profile.modules[selected] === 0) {
        body.innerHTML = this.buildDetail(profile, selected)
        return
      }
      const available = MODULES.filter((module) => profile.modules[module.id] === 0 && canBuildModule(profile, module.id))
      if (available.length === 0) {
        body.innerHTML = `<div class="build-empty">${icon('check')} <span><b>Castillo completo.</b> Pasa a <b>MEJORAR</b> para subir muros y torres, o a <b>UNIDADES</b> para preparar la guarnición.</span></div>`
        return
      }
      body.innerHTML = available
        .map((module) => {
          const cost = moduleBuildCost(module.id)
          return `<button class="build-card" data-action="select" data-module="${module.id}">
            <span class="slot-disc">${moduleGlyph(module.id)}</span>
            <span class="build-card-copy"><b>${module.name}</b><p>${costLine(cost.wood, cost.coins)}</p></span>
          </button>`
        })
        .join('')
      return
    }

    const built = MODULES.filter((module) => profile.modules[module.id] > 0)
    if (built.length === 0) {
      body.innerHTML = `<div class="build-empty">${icon('lock')} <span>Primero construye muros y torres en <b>CONSTRUIR</b>.</span></div>`
      return
    }
    if (selected && profile.modules[selected] > 0) {
      body.innerHTML = this.upgradeDetail(profile, selected)
      return
    }
    body.innerHTML = built
      .map((module) => {
        const level = profile.modules[module.id]
        const maxed = level >= 5
        const cost = moduleUpgradeCost(module.id, level)
        return `<button class="build-card" data-action="select" data-module="${module.id}">
          <span class="slot-disc">${moduleGlyph(module.id)}</span>
          <span class="build-card-copy"><b>${module.name} · Nv ${level}</b><p>${maxed ? 'Nivel máximo' : costLine(cost.wood, cost.coins)}</p></span>
        </button>`
      })
      .join('')
  }

  private buildDetail(profile: Profile, id: ModuleId): string {
    const module = MODULE_BY_ID[id]
    const cost = moduleBuildCost(id)
    const supported = canBuildModule(profile, id)
    const affordable = profile.wood >= cost.wood && profile.coins >= cost.coins
    return `<div class="build-card build-detail">
      <span class="slot-disc">${moduleGlyph(id)}</span>
      <span class="build-card-copy"><b>${module.name}</b><p>${costLine(cost.wood, cost.coins)} · ${module.hp} PV</p></span>
      <button class="btn btn-green" data-action="build" data-module="${id}" ${!supported || !affordable ? 'disabled' : ''}>CONSTRUIR</button>
    </div>
    ${supported ? '' : `<div class="build-empty">${icon('lock')} <span>Necesitas el módulo de apoyo construido primero.</span></div>`}
    `
  }

  private upgradeDetail(profile: Profile, id: ModuleId): string {
    const module = MODULE_BY_ID[id]
    const level = profile.modules[id]
    const cost = moduleUpgradeCost(id, level)
    const maxed = level >= 5
    const affordable = profile.wood >= cost.wood && profile.coins >= cost.coins
    return `<div class="build-card build-detail">
      <span class="slot-disc">${moduleGlyph(id)}</span>
      <span class="build-card-copy"><b>${module.name} · Nv ${level}</b><p>${maxed ? 'Nivel máximo' : `${costLine(cost.wood, cost.coins)} · ${module.hp + module.hpPerLevel * level} PV`}</p></span>
      <button class="btn btn-gold" data-action="upgrade" data-module="${id}" ${maxed || !affordable ? 'disabled' : ''}>${maxed ? 'MÁXIMO' : 'MEJORAR'}</button>
    </div>`
  }

  private unitsPanel(profile: Profile, activeSlot: number): string {
    const loadout = profile.loadout
    const slotButtons = loadout
      .map((unit, index) => {
        const name = unit ? UNIT_BY_ID[unit].name : 'Vacía'
        return `<button class="unit-slot ${index === activeSlot ? 'active' : ''}" data-action="unit-slot" data-slot="${index}">${index + 1}. ${name}</button>`
      })
      .join('')
    const cards = UNITS.map((unit) => {
      const state = profile.units[unit.id]
      const equipped = loadout.includes(unit.id)
      if (!state.unlocked) {
        return `<button class="unit-card locked" data-action="unlock" data-unit="${unit.id}">
          <svg class="mini-lock" aria-hidden="true"><use href="#i-lock" /></svg>
          <img class="unit-mini" src="${drawUnitPortrait(unit.id, 'player')}" alt="" />
          <b>${unit.name}</b><small>${icon('coin')} ${formatNumber(unit.unlock)}</small>
        </button>`
      }
      return `<button class="unit-card ${equipped ? 'selected' : ''}" data-action="equip" data-unit="${unit.id}">
        <img class="unit-mini" src="${drawUnitPortrait(unit.id, 'player')}" alt="" />
        <b>${unit.name}</b><small>Nv ${state.level} · ${unit.role}</small>
        <span class="unit-card-actions">
          <span class="unit-upgrade" data-action="unit-upgrade" data-unit="${unit.id}">${icon('coin')} ${formatNumber(unitUpgradeCost(unit.id, state.level))}</span>
        </span>
      </button>`
    }).join('')
    return `<div class="units-panel">
      <div class="unit-slots">${slotButtons}</div>
      <div class="unit-grid">${cards}</div>
    </div>`
  }

  renderBattle(battle: Battle, speed: number): void {
    const playerHp = Math.round(battle.playerHp)
    const enemyHp = Math.round(battle.enemyHp)
    if (playerHp !== this.lastHud.playerHp) {
      this.lastHud.playerHp = playerHp
      el<HTMLElement>('player-hp').textContent = `${playerHp}%`
      el<HTMLElement>('player-health-bar').style.width = `${playerHp}%`
    }
    if (enemyHp !== this.lastHud.enemyHp) {
      this.lastHud.enemyHp = enemyHp
      el<HTMLElement>('enemy-hp').textContent = `${enemyHp}%`
      el<HTMLElement>('enemy-health-bar').style.width = `${enemyHp}%`
    }
    const timer = formatClock(battle.timeLeft)
    if (timer !== this.lastHud.timer) {
      this.lastHud.timer = timer
      const timerEl = el<HTMLElement>('battle-timer')
      timerEl.textContent = timer
      timerEl.classList.toggle('low', battle.timeLeft <= 15)
    }
    const wind = Math.round(Math.abs(battle.wind) * 100)
    const windKey = `${wind}:${battle.wind >= 0}`
    if (windKey !== this.lastHud.wind) {
      this.lastHud.wind = windKey
      el<HTMLElement>('wind-value').textContent = String(wind)
      const arrow = el<HTMLElement>('wind-arrow')
      arrow.textContent = battle.wind >= 0 ? '→' : '←'
    }
    const power = Math.round(battle.aim.power * 100)
    if (power !== this.lastHud.power) {
      this.lastHud.power = power
      el<HTMLElement>('aim-power').textContent = `${power}%`
    }
    const angle = Math.round(battle.aim.angle)
    if (angle !== this.lastHud.angle) {
      this.lastHud.angle = angle
      el<HTMLElement>('aim-angle').textContent = `${angle}°`
    }
    const ready = battle.phase === 'fight' && battle.cooldown <= 0
    const fire = el<HTMLButtonElement>('btn-fire')
    fire.disabled = !ready
    fire.classList.toggle('ready', ready)
    const fireLabel = ready ? 'DISPARAR' : 'RECARGANDO'
    if (fireLabel !== this.lastHud.fireLabel) {
      this.lastHud.fireLabel = fireLabel
      el<HTMLElement>('fire-label').textContent = fireLabel
    }
    if (speed !== this.lastHud.speed) {
      this.lastHud.speed = speed
      el<HTMLElement>('btn-speed').textContent = `×${speed}`
    }
    this.lastHud.phase = battle.phase
    const key = `${battle.player.units.map((u) => `${u.hp}:${u.dead}`).join('|')}::${battle.enemy.units.map((u) => `${u.hp}:${u.dead}`).join('|')}`
    if (key !== this.lastUnitKey) {
      this.lastUnitKey = key
      this.renderUnitRow('unit-row-player', battle.player.units, 'player')
      this.renderUnitRow('unit-row-enemy', battle.enemy.units, 'enemy')
    }
    if (battle.stats.shots > 0) el<HTMLElement>('battle-hint').classList.add('fade')
  }

  private renderUnitRow(id: string, units: Battle['player']['units'], side: 'player' | 'enemy'): void {
    const row = el<HTMLDivElement>(id)
    row.innerHTML = units
      .map((unit) => {
        const def = UNIT_BY_ID[unit.kind]
        const hp = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100))
        return `<div class="unit-chip ${side} ${unit.dead ? 'dead' : ''}" title="${def.name}">
          <img src="${drawUnitPortrait(unit.kind, side)}" alt="${def.name}" />
          <span class="unit-hp"><i style="width:${hp}%"></i></span>
        </div>`
      })
      .join('')
  }

  setBattleNames(battle: Battle): void {
    el<HTMLElement>('player-name').textContent = battle.player.name
    el<HTMLElement>('enemy-name').textContent = battle.enemy.name
    el<HTMLElement>('player-trophies').innerHTML = `${icon('trophy')} ${formatNumber(battle.player.trophies)}`
    el<HTMLElement>('enemy-trophies').innerHTML = `${icon('trophy')} ${formatNumber(battle.enemy.trophies)}`
  }

  showResult(result: BattleResult, profile: Profile): void {
    const card = document.querySelector<HTMLElement>('.result-card')
    card?.classList.toggle('defeat', !result.win)
    el<HTMLElement>('result-kicker').textContent = result.win ? 'VICTORIA' : 'DERROTA'
    el<HTMLElement>('result-title').textContent =
      result.reason === 'core'
        ? result.win
          ? 'CASTILLO DERRIBADO'
          : 'TU FORTALEZA CAYÓ'
        : result.win
          ? 'VICTORIA POR PUNTOS'
          : 'DERROTA POR PUNTOS'
    const accuracy = result.shots > 0 ? Math.round((result.hits / result.shots) * 100) : 0
    const stars = result.win ? (accuracy >= 55 && result.playerHp >= 55 ? 3 : 2) : 1
    el<HTMLElement>('result-stars').innerHTML = Array.from({ length: 3 }, (_, index) => {
      const active = index < stars
      return `<span class="star" style="animation-delay:${index * 70}ms;opacity:${active ? 1 : 0.28};color:${active ? '#d8911f' : 'rgba(36,26,19,.22)'}">★</span>`
    }).join('')
    const trophyText = `${result.trophies >= 0 ? '+' : ''}${result.trophies}`
    el<HTMLElement>('result-rewards').innerHTML = `
      <span class="reward-chip coin">${icon('coin')} +${formatNumber(result.coins)}</span>
      <span class="reward-chip wood">${icon('wood')} +${formatNumber(result.wood)}</span>
      <span class="reward-chip trophy">${icon('trophy')} ${trophyText}</span>`
    el<HTMLElement>('result-stats').innerHTML = `
      <div class="result-stat"><span>DAÑO</span><b>${formatNumber(result.damage)}</b></div>
      <div class="result-stat"><span>PRECISIÓN</span><b>${accuracy}%</b></div>
      <div class="result-stat"><span>TIEMPO</span><b>${formatClock(result.time)}</b></div>`
    this.renderWallet(profile)
  }

  setAim(angle: number, power: number): void {
    el<HTMLElement>('aim-angle').textContent = `${Math.round(angle)}°`
    el<HTMLElement>('aim-power').textContent = `${Math.round(power * 100)}%`
  }

  announce(text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    const node = el<HTMLElement>('announce')
    node.textContent = text
    node.className = `announce show ${tone === 'neutral' ? '' : tone}`
    if (this.announceTimer !== null) window.clearTimeout(this.announceTimer)
    this.announceTimer = window.setTimeout(() => {
      node.className = `announce ${tone === 'neutral' ? '' : tone}`
    }, 1250)
  }

  toast(text: string): void {
    const node = el<HTMLElement>('toast')
    node.textContent = text
    node.classList.add('show')
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => node.classList.remove('show'), 2300)
  }

  openSettings(profile: Profile): void {
    el<HTMLInputElement>('set-sound').checked = profile.settings.sound
    el<HTMLInputElement>('set-music').checked = profile.settings.music
    el<HTMLInputElement>('set-motion').checked = profile.settings.reducedMotion
    el<HTMLButtonElement>('btn-install-settings').classList.toggle('hidden', !this.installAvailable)
    el<HTMLDivElement>('modal-settings').classList.add('open')
  }

  closeSettings(): void {
    el<HTMLDivElement>('modal-settings').classList.remove('open')
  }

  openPause(): void {
    el<HTMLDivElement>('modal-pause').classList.add('open')
  }

  closePause(): void {
    el<HTMLDivElement>('modal-pause').classList.remove('open')
  }

  showIosInstall(): void {
    el<HTMLDivElement>('modal-ios').classList.add('open')
  }

  setInstallAvailable(available: boolean): void {
    this.installAvailable = available
    this.setInstallVisible(available)
  }

  private setInstallVisible(available: boolean): void {
    for (const id of ['btn-install', 'btn-install-settings']) {
      const node = document.getElementById(id)
      if (!node) continue
      node.classList.toggle('hidden', !available)
    }
    el<HTMLButtonElement>('btn-install-settings').classList.toggle('hidden', !available)
  }

  resetHudCache(): void {
    this.lastHud = {
      playerHp: -1,
      enemyHp: -1,
      timer: '',
      wind: '',
      power: -1,
      angle: -1,
      cooldown: -1,
      fireLabel: 'DISPARAR',
      speed: 0,
      phase: '',
      hint: '',
    }
    this.lastUnitKey = ''
    el<HTMLElement>('fire-label').textContent = 'DISPARAR'
    el<HTMLElement>('battle-hint').classList.remove('fade')
    el<HTMLButtonElement>('btn-fire').classList.remove('ready')
    el<HTMLButtonElement>('btn-speed').textContent = '×1'
  }

  setSpeed(speed: number): void {
    el<HTMLElement>('btn-speed').textContent = `×${speed}`
  }

  clearModalState(): void {
    this.closeSettings()
    this.closePause()
  }

  setBootstrapError(message: string): void {
    const boot = document.getElementById('boot')
    if (boot) {
      boot.innerHTML = `<div class="boot-title">MICRO SIEGE</div><p style="max-width:60%;text-align:center;color:#ffb6a8;font-weight:800">${message}</p>`
    }
  }

  get isSettingsOpen(): boolean {
    return el<HTMLDivElement>('modal-settings').classList.contains('open')
  }

  get isPauseOpen(): boolean {
    return el<HTMLDivElement>('modal-pause').classList.contains('open')
  }

  get installReady(): boolean {
    return this.installAvailable
  }

  setHomeStatsEmpty(): void {
    el<HTMLDivElement>('home-stats').innerHTML = ''
  }

  static icon = icon
}
