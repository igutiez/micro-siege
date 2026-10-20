import {
  AI_LOADOUTS,
  AI_MODULE_LEVELS,
  ARENAS,
  DAILY_REWARD,
  DEFAULT_LOADOUT,
  LOSS_REWARD,
  MAX_TROPHIES,
  MODULE_BY_ID,
  MODULES,
  RANKS,
  STARTING_MODULE_LEVELS,
  START_COINS,
  START_WOOD,
  UNIT_BY_ID,
  UNITS,
  WIN_REWARD,
} from './config.ts'
import type { ArenaDef, BattleResult, ModuleId, Profile, UnitId } from './types.ts'

const STORAGE_KEY = 'micro-siege.profile.v1'
const PROFILE_VERSION = 1

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function defaultProfile(): Profile {
  const units = Object.fromEntries(
    UNITS.map((unit) => [unit.id, { level: 1, unlocked: unit.unlock === 0 }]),
  ) as Record<UnitId, { level: number; unlocked: boolean }>
  units.archer = { level: 1, unlocked: true }
  units.knight = { level: 1, unlocked: true }
  return {
    version: PROFILE_VERSION,
    coins: START_COINS,
    wood: START_WOOD,
    trophies: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    battles: 0,
    modules: { ...STARTING_MODULE_LEVELS },
    units,
    loadout: [...DEFAULT_LOADOUT],
    settings: { sound: true, music: true, reducedMotion: false, tutorialSeen: false },
    lastDaily: null,
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.max(min, Math.min(max, number))
}

function sanitize(raw: unknown): Profile {
  const base = defaultProfile()
  if (typeof raw !== 'object' || raw === null) return base
  const data = raw as Partial<Profile>

  base.coins = clampInt(data.coins, 0, 999_999, base.coins)
  base.wood = clampInt(data.wood, 0, 999_999, base.wood)
  base.trophies = clampInt(data.trophies, 0, MAX_TROPHIES, base.trophies)
  base.wins = clampInt(data.wins, 0, 999_999, 0)
  base.losses = clampInt(data.losses, 0, 999_999, 0)
  base.streak = clampInt(data.streak, -999, 999, 0)
  base.battles = clampInt(data.battles, 0, 999_999, 0)
  base.lastDaily = typeof data.lastDaily === 'string' ? data.lastDaily : null

  if (data.modules && typeof data.modules === 'object') {
    for (const module of MODULES) {
      const value = (data.modules as Record<string, unknown>)[module.id]
      base.modules[module.id] = clampInt(value, 0, 5, base.modules[module.id])
    }
  }

  if (data.units && typeof data.units === 'object') {
    for (const unit of UNITS) {
      const value = (data.units as Record<string, unknown>)[unit.id]
      if (value && typeof value === 'object') {
        const state = value as { level?: unknown; unlocked?: unknown }
        base.units[unit.id] = {
          level: clampInt(state.level, 1, 5, 1),
          unlocked: state.unlocked === true || unit.unlock === 0,
        }
      }
    }
  }

  if (Array.isArray(data.loadout)) {
    base.loadout = data.loadout.slice(0, 4).map((entry) => {
      if (entry === null || entry === undefined) return null
      if (typeof entry === 'string' && entry in UNIT_BY_ID) {
        return base.units[entry as UnitId].unlocked ? (entry as UnitId) : null
      }
      return null
    })
    while (base.loadout.length < 4) base.loadout.push(null)
  }

  if (data.settings && typeof data.settings === 'object') {
    const settings = data.settings as Partial<Profile['settings']>
    base.settings.sound = settings.sound !== false
    base.settings.music = settings.music !== false
    base.settings.reducedMotion = settings.reducedMotion === true
    base.settings.tutorialSeen = settings.tutorialSeen === true
  }

  return base
}

export function loadProfile(): Profile {
  const store = storage()
  if (!store) return defaultProfile()
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return defaultProfile()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaultProfile()
    const version = (parsed as { version?: unknown }).version
    if (version !== PROFILE_VERSION) return defaultProfile()
    return sanitize(parsed)
  } catch {
    return defaultProfile()
  }
}

export function saveProfile(profile: Profile): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Private browsing or a full quota: the in-memory profile keeps the session playable.
  }
}

export function rankFor(trophies: number): (typeof RANKS)[number] {
  let current = RANKS[0]
  for (const rank of RANKS) {
    if (trophies >= rank.min) current = rank
  }
  return current
}

export function rankIndex(trophies: number): number {
  return RANKS.findIndex((rank) => rank.id === rankFor(trophies).id)
}

export function arenaFor(trophies: number): ArenaDef {
  let current = ARENAS[0]
  for (const arena of ARENAS) {
    if (trophies >= arena.minTrophies) current = arena
  }
  return current
}

export function formatNumber(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('es-ES')
}

export function moduleBuildCost(id: ModuleId): { wood: number; coins: number } {
  const module = MODULE_BY_ID[id]
  return { wood: module.costWood, coins: module.costCoins }
}

export function moduleUpgradeCost(id: ModuleId, level: number): { wood: number; coins: number } {
  const module = MODULE_BY_ID[id]
  if (level <= 0) return { wood: module.costWood, coins: module.costCoins }
  return {
    wood: Math.max(30, Math.round(module.costWood * 0.62 * level)),
    coins: Math.max(25, Math.round(module.costCoins * 0.58 * level)),
  }
}

export function moduleMaxLevel(level: number): boolean {
  return level >= 5
}

export function canBuildModule(profile: Profile, id: ModuleId): boolean {
  const module = MODULE_BY_ID[id]
  if (profile.modules[id] > 0) return false
  if (module.support && profile.modules[module.support] <= 0) return false
  return true
}

export function canUpgradeModule(profile: Profile, id: ModuleId): boolean {
  const level = profile.modules[id]
  return level > 0 && level < 5
}

export function canAfford(profile: Profile, coins: number, wood: number): boolean {
  return profile.coins >= coins && profile.wood >= wood
}

export function spend(profile: Profile, coins: number, wood: number): boolean {
  if (!canAfford(profile, coins, wood)) return false
  profile.coins -= coins
  profile.wood -= wood
  return true
}

export function unitUpgradeCost(id: UnitId, level: number): number {
  const unit = UNIT_BY_ID[id]
  if (level <= 0) return unit.unlock
  return Math.max(60, Math.round(unit.unlock * 0.34 * level + 55))
}

export function unitPower(profile: Profile, id: UnitId): { hp: number; damage: number; level: number } {
  const unit = UNIT_BY_ID[id]
  const level = profile.units[id].level
  return {
    hp: Math.round(unit.hp + unit.hpPerLevel * (level - 1)),
    damage: Math.round((unit.damage + unit.damagePerLevel * (level - 1)) * 10) / 10,
    level,
  }
}

export function loadoutUnits(profile: Profile): UnitId[] {
  return profile.loadout.filter((id): id is UnitId => id !== null)
}

export function dailyAvailable(profile: Profile): boolean {
  return profile.lastDaily !== todayKey()
}

export function claimDaily(profile: Profile): { coins: number; wood: number } | null {
  if (!dailyAvailable(profile)) return null
  profile.lastDaily = todayKey()
  profile.coins += DAILY_REWARD.coins
  profile.wood += DAILY_REWARD.wood
  saveProfile(profile)
  return { ...DAILY_REWARD }
}

export function applyBattleResult(profile: Profile, result: BattleResult): { coins: number; wood: number; trophies: number } {
  const coins = result.coins
  const wood = result.wood
  const trophies = result.trophies
  profile.coins = Math.max(0, profile.coins + coins)
  profile.wood = Math.max(0, profile.wood + wood)
  profile.trophies = Math.max(0, Math.min(MAX_TROPHIES, profile.trophies + trophies))
  profile.battles += 1
  if (result.win) {
    profile.wins += 1
    profile.streak = Math.max(0, profile.streak) + 1
  } else {
    profile.losses += 1
    profile.streak = Math.min(0, profile.streak) - 1
  }
  saveProfile(profile)
  return { coins, wood, trophies }
}

export function rewardFor(win: boolean): { coins: number; wood: number; trophies: number } {
  return win
    ? { coins: WIN_REWARD.coins, wood: WIN_REWARD.wood, trophies: WIN_REWARD.trophies }
    : { coins: LOSS_REWARD.coins, wood: LOSS_REWARD.wood, trophies: LOSS_REWARD.trophies }
}

export interface AiOpponent {
  name: string
  trophies: number
  levels: Record<ModuleId, number>
  loadout: UnitId[]
  unitLevel: number
  error: number
  delay: number
  arena: ArenaDef
}

export function makeAi(profile: Profile): AiOpponent {
  const index = rankIndex(profile.trophies)
  const arena = arenaFor(profile.trophies)
  const names = arena.aiNames
  const name = names[Math.floor(Math.random() * names.length)] ?? 'RIVAL'
  const levels = { ...AI_MODULE_LEVELS[Math.min(index, AI_MODULE_LEVELS.length - 1)] }
  const loadout = [...AI_LOADOUTS[Math.min(index, AI_LOADOUTS.length - 1)]]
  const error = [0.14, 0.1, 0.065, 0.035][Math.min(index, 3)] ?? 0.1
  const delay = [4.6, 3.9, 3.3, 2.8][Math.min(index, 3)] ?? 4
  const trophyNoise = Math.floor(Math.random() * 80) - 40
  return {
    name,
    trophies: Math.max(0, profile.trophies + trophyNoise),
    levels,
    loadout,
    unitLevel: Math.min(5, 1 + index),
    error,
    delay,
    arena,
  }
}

export function totalModuleLevels(levels: Record<ModuleId, number>): number {
  return MODULES.reduce((sum, module) => sum + levels[module.id], 0)
}

export function playerDisplayName(): string {
  return 'TÚ'
}
