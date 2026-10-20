import './styles.css'
import { Game } from './game/game.ts'
import { registerServiceWorker } from './pwa.ts'

async function start(): Promise<void> {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('No se encontró el lienzo del juego.')

  await Promise.allSettled([
    document.fonts.load('400 100px "Lilita One"'),
    document.fonts.load('800 20px "Nunito"'),
    document.fonts.ready,
  ])

  const game = new Game(canvas)
  await game.boot()
  registerServiceWorker()
  if (import.meta.env.DEV) {
    ;(window as Window & { __microSiege?: Game }).__microSiege = game
  }
}

void start().catch((error: unknown) => {
  console.error(error)
  const boot = document.getElementById('boot')
  if (!boot) return
  const message = error instanceof Error ? error.message : 'Error desconocido al arrancar.'
  boot.innerHTML = `
    <div class="boot-mark">♜</div>
    <div class="boot-title">MICRO SIEGE</div>
    <p style="max-width:70%;text-align:center;color:#ffb6a8;font-weight:800;line-height:1.5">
      No se pudo iniciar el juego.<br />${message}
    </p>`
})
