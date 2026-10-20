import { describe, expect, it } from 'vitest'
import {
  applyBattleResult,
  arenaFor,
  canBuildModule,
  claimDaily,
  dailyAvailable,
  defaultProfile,
  moduleBuildCost,
  moduleUpgradeCost,
  rankFor,
  rewardFor,
  spend,
  todayKey,
  unitUpgradeCost,
} from '../src/game/profile.ts'
import { STARTING_MODULE_LEVELS } from '../src/game/config.ts'

describe('profile economy', () => {
  it('starts with a playable castle and two units', () => {
    const profile = defaultProfile()
    expect(profile.modules.baseL).toBe(1)
    expect(profile.modules.towerL).toBe(0)
    expect(profile.units.archer.unlocked).toBe(true)
    expect(profile.units.knight.unlocked).toBe(true)
    expect(profile.units.mage.unlocked).toBe(false)
    expect(profile.loadout.filter(Boolean)).toEqual(['archer', 'knight'])
    expect(profile.coins).toBeGreaterThan(0)
    expect(profile.wood).toBeGreaterThan(0)
  })

  it('respects support chains for building', () => {
    const profile = defaultProfile()
    expect(canBuildModule(profile, 'towerL')).toBe(true)
    expect(canBuildModule(profile, 'roof')).toBe(true)
    profile.modules.wallL1 = 0
    expect(canBuildModule(profile, 'towerL')).toBe(false)
  })

  it('charges build and upgrade costs only when affordable', () => {
    const profile = defaultProfile()
    profile.coins = 10
    profile.wood = 10
    expect(spend(profile, 20, 5)).toBe(false)
    expect(profile.coins).toBe(10)
    expect(moduleBuildCost('towerL').wood).toBeGreaterThan(0)
    expect(moduleUpgradeCost('towerL', 1).coins).toBeGreaterThan(0)
    expect(unitUpgradeCost('archer', 1)).toBeGreaterThan(0)
  })

  it('maps trophy thresholds to ranks and arenas', () => {
    expect(rankFor(0).id).toBe('bronze')
    expect(rankFor(260).id).toBe('silver')
    expect(rankFor(700).id).toBe('gold')
    expect(rankFor(1200).id).toBe('legend')
    expect(arenaFor(0).id).toBe('dusk')
    expect(arenaFor(260).id).toBe('lagoon')
    expect(arenaFor(700).id).toBe('meadow')
    expect(arenaFor(1200).id).toBe('ember')
  })

  it('applies win and loss rewards with clamped trophies', () => {
    const profile = defaultProfile()
    const win = rewardFor(true)
    applyBattleResult(profile, {
      win: true,
      reason: 'core',
      ...win,
      damage: 200,
      shots: 5,
      hits: 4,
      time: 70,
      enemyName: 'RIVAL',
      playerHp: 100,
      enemyHp: 0,
    })
    expect(profile.wins).toBe(1)
    expect(profile.trophies).toBe(win.trophies)
    expect(profile.coins).toBeGreaterThan(0)

    profile.trophies = 2
    const loss = rewardFor(false)
    applyBattleResult(profile, {
      win: false,
      reason: 'timer',
      ...loss,
      damage: 0,
      shots: 0,
      hits: 0,
      time: 90,
      enemyName: 'RIVAL',
      playerHp: 60,
      enemyHp: 100,
    })
    expect(profile.losses).toBe(1)
    expect(profile.trophies).toBe(0)
  })

  it('grants the daily reward once per local day', () => {
    const profile = defaultProfile()
    expect(dailyAvailable(profile)).toBe(true)
    const result = claimDaily(profile)
    expect(result).not.toBeNull()
    expect(profile.lastDaily).toBe(todayKey())
    expect(dailyAvailable(profile)).toBe(false)
    expect(claimDaily(profile)).toBeNull()
  })

  it('keeps starting levels aligned with the config table', () => {
    expect(defaultProfile().modules).toEqual(STARTING_MODULE_LEVELS)
  })
})
