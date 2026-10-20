# Micro Siege

**Asedio de castillos con ruedas.** Construye tu fortaleza, coloca la guarnición, apunta con el viento y derriba el núcleo rival.

### ▶ Juega online

**https://igutiez.github.io/micro-siege/**

PWA instalable y offline. En Chrome/Edge pulsa **Instalar app**. En iPhone/iPad: **Compartir → Añadir a pantalla de inicio**.

![Pantalla de inicio de Micro Siege](02-DOCS/screenshots/home.webp)

## Qué hay dentro

- **Duelo 1v1 en tiempo real contra la IA**: cañón, viento cambiante, munición con caída y destrucción por módulos.
- **Castillo con 9 módulos**: cimientos, muros, torres y tejado. Si destruyes el apoyo, lo que hay encima se derrumba.
- **8 unidades** con proyectiles y comportamientos propios: arquera, caballero, bombardero, asedio, maga, ingeniera, bruto y ballestera.
- **Progresión local**: monedas, madera, mejoras de módulos y unidades, copas, rangos Bronce/Plata/Oro/Leyenda, regalo diario y cuatro arenas.
- **PWA real**: manifiesto, service worker, caché offline, iconos maskable, pantalla completa y bloqueo de orientación.
- **iOS + Android**: diseño 16:9 adaptable, safe areas, controles táctiles, giro obligatorio en vertical y instalación guiada en iOS.
- **Audio procedural** con WebAudio: cañones, impactos, derrumbes, monedas y música ambiental. Sin archivos de audio externos.
- **Cero dependencias de runtime**: TypeScript + Canvas 2D + Vite. Todo el arte se dibuja por código.

![Taller de construcción](02-DOCS/screenshots/build.webp)
![Batalla](02-DOCS/screenshots/battle.webp)
![Resultado](02-DOCS/screenshots/result.webp)
![Móvil en horizontal](02-DOCS/screenshots/mobile.webp)

## Cómo se juega

| Acción | Táctil | Teclado |
| --- | --- | --- |
| Apuntar | Arrastra desde el cañón y suelta | Flechas ↑/↓ (ángulo), ←/→ (potencia) |
| Disparar | Suelta el arrastre o pulsa **Disparar** | Espacio |
| Pausa | Botón de pausa | `P` o `Esc` |
| Velocidad ×2 | Botón `×1`/`×2` | `S` |
| Construir / mejorar | Taller → pestañas **Construir**, **Mejorar**, **Unidades** | — |

El objetivo es dejar a cero el **núcleo** del rival antes de que se agote el tiempo. Si el tiempo termina, gana quien conserve más salud estructural. Las unidades no terminan la partida por sí solas: siguen disparando aunque mueran todas.

## Desarrollo

```bash
npm install
npm run dev        # http://127.0.0.1:5276
npm test           # 23 tests de física, economía, castillo y batalla
npm run build      # typecheck + build de producción
npm run build:pages # build con base /micro-siege/
npm run deploy     # publica dist en la rama gh-pages
```

### Estructura

```text
src/
  game/
    art.ts       # fondos, castillos, unidades, partículas y UI de canvas
    audio.ts     # sintetizador WebAudio
    battle.ts    # simulación 1v1, IA, proyectiles y fin de partida
    castle.ts    # rejilla 5×4, daño, apoyo estructural y derrumbe
    config.ts    # módulos, unidades, arenas y economía
    game.ts      # orquestación de pantallas, entrada y render
    physics.ts   # balística, viento y búsqueda de tiro de la IA
    profile.ts   # perfil, localStorage, recompensas y rangos
    types.ts     # tipos compartidos
    ui.ts        # HUD, taller, ajustes, pausa y resultado
  main.ts        # arranque y registro del service worker
  pwa.ts         # instalación y antes de instalar
  styles.css     # sistema visual responsive
```

## Privacidad

Todo el progreso se guarda en `localStorage` del dispositivo. No hay cuentas, analítica, anuncios ni llamadas a servidores. La batalla es offline contra la IA.

## Créditos y alcance

Código, arte procedural, nombres y textos originales. Tipografías **Lilita One** y **Nunito** bajo SIL Open Font License (ver `public/licenses/`). Inspirado en la mecánica clásica de asedio con castillos móviles; no está afiliado, patrocinado ni respaldado por ningún juego o estudio existente. No se redistribuyen assets de terceros.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
