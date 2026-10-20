import type {
  ArenaDef,
  ArenaId,
  Cell,
  ModuleDef,
  ModuleId,
  Palette,
  UnitDef,
  UnitId,
} from './types.ts'

export const WORLD = { w: 1280, h: 720 } as const

export const CELL = 52
export const COLS = 5
export const ROWS = 4
export const CASTLE_W = COLS * CELL
export const CASTLE_H = ROWS * CELL
export const CASTLE_Y = 284
export const PLAYER_X = 150
export const BATTLE_TIME = 90
export const GRAVITY = 560
export const WIND_ACCEL = 62
export const MAX_PARTICLES = 420

export const MODULES: ModuleDef[] = [
  { id: 'baseL', name: 'Cimiento izquierdo', kind: 'base', col: 0, row: 3, costWood: 100, costCoins: 80, hp: 180, hpPerLevel: 70 },
  { id: 'baseR', name: 'Cimiento derecho', kind: 'base', col: 4, row: 3, costWood: 100, costCoins: 80, hp: 180, hpPerLevel: 70 },
  { id: 'wallL2', name: 'Muro bajo izquierdo', kind: 'wall', col: 0, row: 2, costWood: 110, costCoins: 90, hp: 160, hpPerLevel: 55, support: 'baseL' },
  { id: 'wallR2', name: 'Muro bajo derecho', kind: 'wall', col: 4, row: 2, costWood: 110, costCoins: 90, hp: 160, hpPerLevel: 55, support: 'baseR' },
  { id: 'wallL1', name: 'Muro alto izquierdo', kind: 'wall', col: 0, row: 1, costWood: 120, costCoins: 100, hp: 140, hpPerLevel: 50, support: 'wallL2' },
  { id: 'wallR1', name: 'Muro alto derecho', kind: 'wall', col: 4, row: 1, costWood: 120, costCoins: 100, hp: 140, hpPerLevel: 50, support: 'wallR2' },
  { id: 'towerL', name: 'Torre izquierda', kind: 'tower', col: 0, row: 0, costWood: 180, costCoins: 140, hp: 180, hpPerLevel: 65, support: 'wallL1' },
  { id: 'towerR', name: 'Torre derecha', kind: 'tower', col: 4, row: 0, costWood: 180, costCoins: 140, hp: 180, hpPerLevel: 65, support: 'wallR1' },
  { id: 'roof', name: 'Tejado del torreón', kind: 'roof', col: 2, row: 0, costWood: 160, costCoins: 120, hp: 220, hpPerLevel: 80 },
]

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((module) => [module.id, module])) as Record<ModuleId, ModuleDef>

export const MODULE_ORDER: ModuleId[] = [
  'baseL',
  'baseR',
  'wallL2',
  'wallR2',
  'wallL1',
  'wallR1',
  'towerL',
  'towerR',
  'roof',
]

export const FIXED_BASES: ReadonlyArray<{ col: number; row: number }> = [
  { col: 1, row: 3 },
  { col: 3, row: 3 },
]

export const CORE_CELL = { col: 2, row: 3 } as const

export const UNIT_SLOTS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 1, row: 2 },
  { col: 2, row: 2 },
  { col: 3, row: 2 },
  { col: 2, row: 1 },
]

export const CORE_HP = 340

export const UNITS: UnitDef[] = [
  {
    id: 'archer',
    name: 'Arquera',
    role: 'Rápida y precisa',
    description: 'Flechas rápidas. Barata y constante.',
    unlock: 0,
    hp: 55,
    hpPerLevel: 14,
    damage: 7,
    damagePerLevel: 2.2,
    cooldown: 1.15,
    speed: 540,
    gravity: 110,
    color: '#4f9a5c',
    accent: '#b9e68a',
    projectile: 'arrow',
    splash: 0,
  },
  {
    id: 'knight',
    name: 'Caballero',
    role: 'Aguanta la línea',
    description: 'Jabalina pesada y mucha vida.',
    unlock: 220,
    hp: 108,
    hpPerLevel: 24,
    damage: 12,
    damagePerLevel: 3.2,
    cooldown: 1.7,
    speed: 470,
    gravity: 150,
    color: '#4f74b8',
    accent: '#d7e3f7',
    projectile: 'bolt',
    splash: 0,
  },
  {
    id: 'bomber',
    name: 'Bombardero',
    role: 'Daño en área',
    description: 'Bombas que abren huecos en piedra.',
    unlock: 420,
    hp: 72,
    hpPerLevel: 16,
    damage: 18,
    damagePerLevel: 4.4,
    cooldown: 2.2,
    speed: 340,
    gravity: 420,
    color: '#d97732',
    accent: '#ffe0a0',
    projectile: 'bomb',
    splash: 46,
  },
  {
    id: 'siege',
    name: 'Asedio',
    role: 'Muro contra muro',
    description: 'Proyectil enorme. Lento y devastador.',
    unlock: 640,
    hp: 150,
    hpPerLevel: 30,
    damage: 28,
    damagePerLevel: 5.5,
    cooldown: 3.1,
    speed: 390,
    gravity: 300,
    color: '#7e6a55',
    accent: '#ffe1a1',
    projectile: 'boulder',
    splash: 36,
  },
  {
    id: 'mage',
    name: 'Maga',
    role: 'Orbe certero',
    description: 'Un orbe que corrige el viento.',
    unlock: 820,
    hp: 65,
    hpPerLevel: 14,
    damage: 14,
    damagePerLevel: 3.6,
    cooldown: 1.8,
    speed: 360,
    gravity: 40,
    color: '#7c58b8',
    accent: '#e0b8ff',
    projectile: 'orb',
    splash: 22,
  },
  {
    id: 'engineer',
    name: 'Ingeniera',
    role: 'Repara el castillo',
    description: 'Martillea y devuelve vida a un módulo.',
    unlock: 980,
    hp: 90,
    hpPerLevel: 20,
    damage: 0,
    damagePerLevel: 0,
    cooldown: 4.5,
    speed: 0,
    gravity: 0,
    color: '#d9a52e',
    accent: '#fff0a8',
    projectile: 'orb',
    splash: 0,
  },
  {
    id: 'brute',
    name: 'Bruto',
    role: 'Roca viva',
    description: 'Lanza peñascos y resiste como nadie.',
    unlock: 1150,
    hp: 170,
    hpPerLevel: 36,
    damage: 22,
    damagePerLevel: 4.8,
    cooldown: 2.6,
    speed: 430,
    gravity: 280,
    color: '#a6553f',
    accent: '#ffcf9a',
    projectile: 'boulder',
    splash: 30,
  },
  {
    id: 'ranger',
    name: 'Ballestera',
    role: 'Cadencia letal',
    description: 'Virotes rápidos, casi sin caída.',
    unlock: 1350,
    hp: 80,
    hpPerLevel: 18,
    damage: 10,
    damagePerLevel: 2.8,
    cooldown: 1.0,
    speed: 620,
    gravity: 60,
    color: '#2f8c82',
    accent: '#baf5e8',
    projectile: 'bolt',
    splash: 0,
  },
]

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((unit) => [unit.id, unit])) as Record<UnitId, UnitDef>

export const DEFAULT_LOADOUT: (UnitId | null)[] = ['archer', 'knight', null, null]

export const PALETTES: Record<ArenaId, Palette> = {
  dusk: {
    skyTop: '#ffd8b0',
    skyBottom: '#e9906b',
    sun: '#fff0c2',
    sunGlow: 'rgba(255,225,150,0.55)',
    cloud: '#ffe8cf',
    mountainFar: '#b96b63',
    mountainNear: '#824552',
    hillFar: '#6f3d4d',
    hillNear: '#432838',
    ground: '#2a1f2b',
    groundDark: '#1a1520',
    grass: '#d98a4b',
    accent: '#ffc94a',
    fog: 'rgba(255,214,170,0.12)',
    water: '#3f8f9f',
    foreground: '#1c1720',
  },
  lagoon: {
    skyTop: '#a7ece2',
    skyBottom: '#47aeb2',
    sun: '#fff6cf',
    sunGlow: 'rgba(240,255,220,0.5)',
    cloud: '#dcfff7',
    mountainFar: '#4f8f8b',
    mountainNear: '#2f6a68',
    hillFar: '#2f7a5e',
    hillNear: '#1e5545',
    ground: '#163b32',
    groundDark: '#0c2823',
    grass: '#5fbf6a',
    accent: '#ffd36e',
    fog: 'rgba(180,255,240,0.12)',
    water: '#3fc4c9',
    foreground: '#0b241f',
  },
  meadow: {
    skyTop: '#d6eb9f',
    skyBottom: '#efca72',
    sun: '#fff8d5',
    sunGlow: 'rgba(255,245,190,0.5)',
    cloud: '#fff6dd',
    mountainFar: '#8ca85c',
    mountainNear: '#5f7f45',
    hillFar: '#4f8a4a',
    hillNear: '#2f5f38',
    ground: '#213b25',
    groundDark: '#14261a',
    grass: '#77c45a',
    accent: '#ffd45e',
    fog: 'rgba(230,255,180,0.12)',
    water: '#4ba8a0',
    foreground: '#0e2117',
  },
  ember: {
    skyTop: '#ffb09a',
    skyBottom: '#d94f61',
    sun: '#ffe3a8',
    sunGlow: 'rgba(255,200,150,0.5)',
    cloud: '#ffd4c2',
    mountainFar: '#9e4555',
    mountainNear: '#6f2c3f',
    hillFar: '#55223a',
    hillNear: '#35172a',
    ground: '#241322',
    groundDark: '#160b16',
    grass: '#e07b4a',
    accent: '#ffcf5c',
    fog: 'rgba(255,170,140,0.12)',
    water: '#b04a5e',
    foreground: '#180a14',
  },
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'dusk',
    name: 'CAÑÓN DEL OCASO',
    subtitle: 'Donde el sol se rompe contra las torres',
    palette: PALETTES.dusk,
    minTrophies: 0,
    aiNames: ['BRASA', 'TUERCA', 'EL MUDO', 'DORADA', 'PICO ROJO', 'CHISPA', 'EL VIEJO', 'MARTILLO'],
  },
  {
    id: 'lagoon',
    name: 'LAGUNA TURQUESA',
    subtitle: 'Agua dulce, pólvora salada',
    palette: PALETTES.lagoon,
    minTrophies: 250,
    aiNames: ['MAREA', 'CORAL', 'EL ANCLA', 'NIEBLA', 'REFLUJO', 'CONCHA', 'EL FARERO', 'SIRENA'],
  },
  {
    id: 'meadow',
    name: 'PRADERA DE HIERRO',
    subtitle: 'La hierba crece sobre los escudos',
    palette: PALETTES.meadow,
    minTrophies: 600,
    aiNames: ['SIEGA', 'ESPIGA', 'EL BOYERO', 'TRÉBOL', 'LANZA VERDE', 'RAÍZ', 'EL SEGADOR', 'AVELLANA'],
  },
  {
    id: 'ember',
    name: 'TIERRAS DE BRASA',
    subtitle: 'El último asedio huele a ceniza',
    palette: PALETTES.ember,
    minTrophies: 1000,
    aiNames: ['ASCUA', 'CENIZA', 'EL HERRERO', 'FUEGO VIEJO', 'MAGMA', 'CHAMUSCADO', 'LA FORJA', 'ESCORIA'],
  },
]

export interface RankDef {
  id: 'bronze' | 'silver' | 'gold' | 'legend'
  name: string
  min: number
  color: string
}

export const RANKS: RankDef[] = [
  { id: 'bronze', name: 'BRONCE', min: 0, color: '#b87545' },
  { id: 'silver', name: 'PLATA', min: 250, color: '#cfd6dd' },
  { id: 'gold', name: 'ORO', min: 600, color: '#ffc94a' },
  { id: 'legend', name: 'LEYENDA', min: 1000, color: '#e66fff' },
]

export const START_COINS = 1250
export const START_WOOD = 1150
export const MAX_TROPHIES = 1600
export const WIN_REWARD = { coins: 150, wood: 120, trophies: 24 } as const
export const LOSS_REWARD = { coins: 55, wood: 40, trophies: -12 } as const
export const DAILY_REWARD = { coins: 150, wood: 120 } as const

export const AI_LOADOUTS: ReadonlyArray<ReadonlyArray<UnitId>> = [
  ['archer', 'knight'],
  ['archer', 'bomber', 'knight'],
  ['archer', 'bomber', 'siege', 'knight'],
  ['archer', 'bomber', 'siege', 'mage'],
]

export const AI_MODULE_LEVELS: ReadonlyArray<Record<ModuleId, number>> = [
  { baseL: 1, baseR: 1, wallL2: 1, wallR2: 1, wallL1: 1, wallR1: 1, towerL: 0, towerR: 0, roof: 0 },
  { baseL: 1, baseR: 1, wallL2: 1, wallR2: 1, wallL1: 1, wallR1: 1, towerL: 1, towerR: 1, roof: 0 },
  { baseL: 2, baseR: 2, wallL2: 1, wallR2: 1, wallL1: 1, wallR1: 1, towerL: 1, towerR: 1, roof: 1 },
  { baseL: 2, baseR: 2, wallL2: 2, wallR2: 2, wallL1: 2, wallR1: 2, towerL: 2, towerR: 2, roof: 1 },
]

export const STARTING_MODULE_LEVELS: Record<ModuleId, number> = {
  baseL: 1,
  baseR: 1,
  wallL2: 1,
  wallR2: 1,
  wallL1: 1,
  wallR1: 1,
  towerL: 0,
  towerR: 0,
  roof: 0,
}

export function cellAt(cells: readonly Cell[], col: number, row: number): Cell | undefined {
  return cells.find((cell) => cell.col === col && cell.row === row)
}

export function moduleLevel(levels: Record<ModuleId, number>, id: ModuleId): number {
  return levels[id] ?? 0
}
