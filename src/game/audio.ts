type AudioName =
  | 'cannon'
  | 'impact'
  | 'collapse'
  | 'land'
  | 'arrow'
  | 'bomb'
  | 'siege'
  | 'hit'
  | 'ui'
  | 'coin'
  | 'win'
  | 'lose'
  | 'core'
  | 'repair'
  | 'wind'

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

/** Small procedural sound engine. No downloaded audio, no autoplay before a gesture. */
export class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sfx: GainNode | null = null
  private music: GainNode | null = null
  private soundOn = true
  private musicOn = true
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private step = 0
  private unlocked = false

  unlock(): void {
    if (this.unlocked) {
      void this.context?.resume()
      return
    }
    const AudioCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioCtor) return
    try {
      this.context = new AudioCtor()
      this.master = this.context.createGain()
      this.master.gain.value = 0.34
      this.master.connect(this.context.destination)
      this.sfx = this.context.createGain()
      this.sfx.gain.value = this.soundOn ? 0.8 : 0
      this.sfx.connect(this.master)
      this.music = this.context.createGain()
      this.music.gain.value = this.musicOn ? 0.16 : 0
      this.music.connect(this.master)
      this.unlocked = true
      void this.context.resume()
      this.startMusic()
    } catch {
      this.context = null
    }
  }

  setSound(on: boolean): void {
    this.soundOn = on
    if (this.sfx && this.context) this.sfx.gain.setTargetAtTime(on ? 0.8 : 0, this.context.currentTime, 0.03)
  }

  setMusic(on: boolean): void {
    this.musicOn = on
    if (this.music && this.context) this.music.gain.setTargetAtTime(on ? 0.16 : 0, this.context.currentTime, 0.08)
    if (on) this.startMusic()
    else this.stopMusic()
  }

  play(name: string, value = 1): void {
    if (!this.context || !this.sfx || !this.soundOn) return
    const volume = Math.max(0.15, Math.min(1.4, value))
    switch (name as AudioName) {
      case 'cannon': {
        this.tone(118, 0.22, 'triangle', 0.2 * volume, 42)
        this.noise(0.16, 900, 0.12 * volume)
        break
      }
      case 'impact': {
        this.tone(82, 0.24, 'sine', 0.2 * volume, 38)
        this.noise(0.2, 520, 0.16 * volume)
        break
      }
      case 'collapse': {
        this.tone(58, 0.55, 'sawtooth', 0.12 * volume, 28)
        this.noise(0.5, 280, 0.15 * volume)
        break
      }
      case 'land': {
        this.tone(64, 0.18, 'sine', 0.16 * volume, 30)
        this.noise(0.12, 240, 0.1 * volume)
        break
      }
      case 'arrow': {
        this.tone(720, 0.07, 'triangle', 0.045 * volume, 980)
        break
      }
      case 'bomb': {
        this.tone(150, 0.12, 'square', 0.05 * volume, 90)
        this.noise(0.08, 1400, 0.04 * volume)
        break
      }
      case 'siege': {
        this.tone(96, 0.18, 'sawtooth', 0.08 * volume, 58)
        break
      }
      case 'hit': {
        this.tone(340, 0.05, 'square', 0.04 * volume, 220)
        break
      }
      case 'ui': {
        this.tone(520, 0.06, 'triangle', 0.05, 740)
        break
      }
      case 'coin': {
        this.tone(880, 0.08, 'triangle', 0.06)
        this.tone(1320, 0.1, 'triangle', 0.045, undefined, 0.06)
        break
      }
      case 'win': {
        this.sequence([523.25, 659.25, 783.99, 1046.5], 0.12, 0.08)
        break
      }
      case 'lose': {
        this.sequence([392, 329.63, 261.63], 0.18, 0.07)
        break
      }
      case 'core': {
        this.tone(70, 0.7, 'sawtooth', 0.16, 26)
        this.noise(0.8, 180, 0.18)
        break
      }
      case 'repair': {
        this.tone(660, 0.06, 'sine', 0.04)
        this.tone(990, 0.09, 'sine', 0.035, undefined, 0.05)
        break
      }
      case 'wind': {
        this.noise(0.4, 700, 0.04)
        break
      }
      default:
        break
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.context || !this.sfx) return
    const start = this.context.currentTime + delay
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, start)
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(this.sfx)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  private noise(duration: number, cutoff: number, volume: number): void {
    if (!this.context || !this.sfx) return
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(volume, this.context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfx)
    source.start()
  }

  private sequence(notes: number[], spacing: number, volume: number): void {
    notes.forEach((note, index) => {
      this.tone(note, spacing * 1.3, 'triangle', volume, undefined, index * spacing)
    })
  }

  private startMusic(): void {
    if (!this.context || this.musicTimer || !this.musicOn) return
    const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392]
    const bass = [130.81, 146.83, 130.81, 110]
    this.musicTimer = setInterval(() => {
      if (!this.context || !this.music || !this.musicOn) return
      const note = notes[this.step % notes.length]
      if (note !== undefined) {
        const osc = this.context.createOscillator()
        const gain = this.context.createGain()
        osc.type = 'triangle'
        osc.frequency.value = note
        gain.gain.setValueAtTime(0.0001, this.context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.035, this.context.currentTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.5)
        osc.connect(gain)
        gain.connect(this.music)
        osc.start()
        osc.stop(this.context.currentTime + 0.55)
      }
      if (this.step % 4 === 0) {
        const bassNote = bass[Math.floor(this.step / 4) % bass.length]
        if (bassNote !== undefined) {
          const osc = this.context.createOscillator()
          const gain = this.context.createGain()
          osc.type = 'sine'
          osc.frequency.value = bassNote
          gain.gain.setValueAtTime(0.0001, this.context.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.04, this.context.currentTime + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.7)
          osc.connect(gain)
          gain.connect(this.music)
          osc.start()
          osc.stop(this.context.currentTime + 0.75)
        }
      }
      this.step += 1
    }, 480)
  }

  private stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }
}
