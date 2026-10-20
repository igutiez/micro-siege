/** Shared data shapes for the Micro Siege runtime. */

export type Side = 'player' | 'enemy'
export type ArenaId = 'dusk' | 'lagoon' | 'meadow' | 'ember'
export type UnitId =
  | 'archer'
  | 'knight'
  | 'bomber'
  | 'siege'
  | 'mage'
  | 'engineer'
  | 'brute'
  | 'ranger'
export type ModuleId =
  | 'towerL'
  | 'towerR'
  | 'wallL1'
  | 'wallR1'
  | 'wallL2'
  | 'wallR2'
  | 'baseL'
  | 'baseR'
  | 'roof'
export type CellKind = 'empty' | 'room' | 'wall' | 'tower' | 'base' | 'roof' | 'core' | 'rubble'
export type ProjectileKind = 'cannon' | 'arrow' | 'bomb' | 'orb' | 'boulder' | 'bolt'
export type ParticleKind = 'dust' | 'smoke' | 'spark' | 'debris' | 'ember' | 'ring' | 'star' | 'leaf'

export interface Vec2 {
  x: number
  y: number
}

export interface Palette {
  skyTop: string
  skyBottom: string
  sun: string
  sunGlow: string
  cloud: string
  mountainFar: string
  mountainNear: string
  hillFar: string
  hillNear: string
  ground: string
  groundDark: string
  grass: string
  accent: string
  fog: string
  water: string
  foreground: string
}

export interface Cell {
  col: number
  row: number
  kind: CellKind
  moduleId?: ModuleId
  level: number
  hp: number
  maxHp: number
  maxHpBase: number
  falling: boolean
  fallY: number
  fallVy: number
  fallRotation: number
  flash: number
  hitFlash: number
}

export interface Unit {
  id: string
  side: Side
  kind: UnitId
  x: number
  y: number
  hp: number
  maxHp: number
  level: number
  cooldown: number
  attackTimer: number
  bob: number
  flash: number
  dead: boolean
  cellCol: number
  cellRow: number
  recoil: number
}

export interface Castle {
  side: Side
  x: number
  y: number
  scale: number
  cells: Cell[]
  units: Unit[]
  core: Cell
  cannonAngle: number
  cannonRecoil: number
  cannonFlash: number
  name: string
  trophies: number
  palette: Palette
}

export interface Projectile {
  id: number
  side: Side
  kind: ProjectileKind
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  damage: number
  gravity: number
  windFactor: number
  splash: number
  color: string
  trail: Vec2[]
  life: number
  maxLife: number
  source: 'cannon' | 'unit'
}

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  color: string
  gravity: number
  rotation: number
  spin: number
  alpha: number
}

export interface FloatText {
  x: number
  y: number
  text: string
  color: string
  life: number
  maxLife: number
  size: number
  vy: number
}

export interface AimState {
  angle: number
  power: number
  dragging: boolean
}

export interface UnitState {
  level: number
  unlocked: boolean
}

export interface Settings {
  sound: boolean
  music: boolean
  reducedMotion: boolean
  tutorialSeen: boolean
}

export interface Profile {
  version: number
  coins: number
  wood: number
  trophies: number
  wins: number
  losses: number
  streak: number
  battles: number
  modules: Record<ModuleId, number>
  units: Record<UnitId, UnitState>
  loadout: (UnitId | null)[]
  settings: Settings
  lastDaily: string | null
}

export interface UnitDef {
  id: UnitId
  name: string
  role: string
  description: string
  unlock: number
  hp: number
  hpPerLevel: number
  damage: number
  damagePerLevel: number
  cooldown: number
  speed: number
  gravity: number
  color: string
  accent: string
  projectile: ProjectileKind
  splash: number
}

export interface ModuleDef {
  id: ModuleId
  name: string
  kind: CellKind
  col: number
  row: number
  costWood: number
  costCoins: number
  hp: number
  hpPerLevel: number
  support?: ModuleId
}

export interface ArenaDef {
  id: ArenaId
  name: string
  subtitle: string
  palette: Palette
  minTrophies: number
  aiNames: string[]
}

export interface BattleResult {
  win: boolean
  reason: 'core' | 'timer'
  coins: number
  wood: number
  trophies: number
  damage: number
  shots: number
  hits: number
  time: number
  enemyName: string
  playerHp: number
  enemyHp: number
}

export interface BattleStats {
  shots: number
  hits: number
  damage: number
  unitsLost: number
  swaps: number
}

export interface BattleHost {
  impact(x: number, y: number, power: number, color: string): void
  collapse(x: number, y: number): void
  muzzle(x: number, y: number, angle: number, side: Side): void
  dust(x: number, y: number, amount: number, color: string): void
  floatText(x: number, y: number, text: string, color: string, size?: number): void
  shake(amount: number): void
  announce(text: string, tone?: 'good' | 'bad' | 'neutral'): void
  play(name: string, value?: number): void
  endBattle(result: BattleResult): void
}
