import { describe, expect, it } from 'vitest'
import { Battle } from '../src/game/battle.ts'
import { defaultProfile } from '../src/game/profile.ts'
import type { BattleHost, BattleResult } from '../src/game/types.ts'

class TestHost implements BattleHost {
  result: BattleResult | null = null
  announcements: string[] = []
  sounds: string[] = []

  impact(): void {}
  collapse(): void {}
  muzzle(): void {}
  dust(): void {}
  floatText(): void {}
  shake(): void {}
  announce(text: string): void {
    this.announcements.push(text)
  }
  play(name: string): void {
    this.sounds.push(name)
  }
  endBattle(result: BattleResult): void {
    this.result = result
  }
}

function readyBattle(): { battle: Battle; host: TestHost } {
  const host = new TestHost()
  const battle = new Battle(defaultProfile(), host)
  battle.start()
  battle.update(2)
  return { battle, host }
}

describe('battle', () => {
  it('leaves the intro and accepts a player shot only during combat', () => {
    const host = new TestHost()
    const battle = new Battle(defaultProfile(), host)
    expect(battle.phase).toBe('intro')
    expect(battle.firePlayer()).toBe(false)
    battle.start()
    battle.update(2)
    expect(battle.phase).toBe('fight')
    battle.setAim(42, 0.45)
    expect(battle.firePlayer()).toBe(true)
    expect(battle.projectiles).toHaveLength(1)
    expect(battle.stats.shots).toBe(1)
    expect(battle.firePlayer()).toBe(false)
  })

  it('ends by timer and reports point victory after the delay', () => {
    const { battle, host } = readyBattle()
    battle.timeLeft = 0.01
    battle.update(0.02)
    expect(battle.phase).toBe('over')
    expect(battle.result?.reason).toBe('timer')
    expect(battle.result?.win).toBe(true)
    expect(host.result).toBeNull()
    battle.update(2)
    expect(host.result?.reason).toBe('timer')
    expect(host.sounds).toContain('win')
  })

  it('ends by core destruction and reports a core victory', () => {
    const { battle, host } = readyBattle()
    battle.enemy.core.hp = 0
    battle.update(0.02)
    expect(battle.phase).toBe('over')
    expect(battle.result?.reason).toBe('core')
    expect(battle.result?.win).toBe(true)
    battle.update(2)
    expect(host.result?.reason).toBe('core')
    expect(host.sounds).toContain('win')
  })

  it('does not end while units are alive', () => {
    const { battle } = readyBattle()
    battle.player.units.forEach((unit) => {
      unit.dead = true
      unit.hp = 0
    })
    battle.enemy.units.forEach((unit) => {
      unit.dead = true
      unit.hp = 0
    })
    battle.update(0.1)
    expect(battle.phase).toBe('fight')
  })

  it('clamps aim values into the cannon range', () => {
    const { battle } = readyBattle()
    battle.setAim(-20, 2)
    expect(battle.aim.angle).toBe(8)
    expect(battle.aim.power).toBe(1)
    battle.setAim(200, -1)
    expect(battle.aim.angle).toBe(82)
    expect(battle.aim.power).toBe(0.12)
  })
})
