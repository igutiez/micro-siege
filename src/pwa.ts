export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export interface InstallController {
  available(): boolean
  isIos(): boolean
  prompt(): Promise<boolean>
  onChange(listener: (available: boolean) => void): void
  onInstalled(listener: () => void): void
}

export function isIosDevice(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const register = (): void => {
    void navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {
        // Offline mode is an enhancement; the app remains playable without it.
      })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

export function createInstallController(): InstallController {
  let deferred: BeforeInstallPromptEvent | null = null
  const listeners = new Set<(available: boolean) => void>()
  const installedListeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of listeners) listener(deferred !== null)
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
    for (const listener of installedListeners) listener()
  })

  return {
    available: () => deferred !== null,
    isIos: isIosDevice,
    async prompt(): Promise<boolean> {
      if (!deferred) return false
      const event = deferred
      deferred = null
      emit()
      await event.prompt()
      const choice = await event.userChoice
      return choice.outcome === 'accepted'
    },
    onChange(listener): void {
      listeners.add(listener)
      listener(deferred !== null)
    },
    onInstalled(listener): void {
      installedListeners.add(listener)
    },
  }
}
