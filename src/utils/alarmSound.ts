/**
 * Universal Loud SOS Emergency Alarm Audio Controller
 * Plays local project sound /sounds/sos-alarm.mp3 with continuous loop,
 * fallback synthesis buzzer if audio is restricted, and graceful pause/stop.
 */

/**
 * Helper to determine whether the user is actively in the Dispatcher (Admin) portal.
 * The audible alarm siren is STRICTLY restricted to the Dispatcher portal and must
 * NEVER ring on student, faculty, driver or commuter devices.
 */
export function isDispatcherPortal(): boolean {
  if (typeof window === 'undefined') return false

  // 1. Check current URL hash (app uses HashRouter)
  const hash = window.location.hash || ''
  if (hash.startsWith('#/admin') || hash.includes('/admin/')) return true

  // 2. Check pathname fallback
  const pathname = window.location.pathname || ''
  if (pathname.startsWith('/admin') || pathname.includes('/admin/')) return true

  // 3. Check active stored user session
  try {
    const rawRole = localStorage.getItem('campusflow_role') || localStorage.getItem('role') || localStorage.getItem('userRole')
    if (rawRole === 'admin' || rawRole === 'dispatcher') return true

    const rawUser = localStorage.getItem('currentUser') || localStorage.getItem('user')
    if (rawUser) {
      const parsed = JSON.parse(rawUser)
      if (parsed?.role?.toLowerCase() === 'admin' || parsed?.role?.toLowerCase() === 'dispatcher') return true
    }
  } catch {}

  return false
}

class SosAlarmAudioPlayer {
  private audio: HTMLAudioElement | null = null
  private isPlaying: boolean = false
  private audioContext: AudioContext | null = null
  private synthInterval: number | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audio = new Audio('/sounds/sos-alarm.mp3')
        this.audio.loop = true
        this.audio.preload = 'auto'
      } catch (e) {
        console.warn('[SosAlarm] HTMLAudioElement init error:', e)
      }

      // Automatically silence audio if the user navigates away from the Dispatcher portal
      window.addEventListener('hashchange', () => {
        if (!isDispatcherPortal() && this.isPlaying) {
          this.stop()
        }
      })
      window.addEventListener('popstate', () => {
        if (!isDispatcherPortal() && this.isPlaying) {
          this.stop()
        }
      })
    }
  }

  /**
   * Start playing the loud emergency alarm sound continuously.
   * STRICT ENFORCEMENT: Only permits playback if currently inside the Dispatcher portal.
   */
  public async play(): Promise<boolean> {
    if (!isDispatcherPortal()) {
      if (this.isPlaying) this.stop()
      return false
    }

    if (this.isPlaying) return true

    if (this.audio) {
      try {
        this.audio.currentTime = 0
        this.audio.volume = 1.0
        await this.audio.play()
        this.isPlaying = true
        console.log('[SosAlarm] Playing loud SOS emergency alarm in Dispatcher Portal')
        return true
      } catch (err: any) {
        console.warn('[SosAlarm] Autoplay restriction or audio failure. Falling back to Web Audio buzzer:', err.message)
        return this.startFallbackBuzzer()
      }
    } else {
      return this.startFallbackBuzzer()
    }
  }

  /**
   * Web Audio API synthesized siren buzzer fallback
   */
  private startFallbackBuzzer(): boolean {
    if (typeof window === 'undefined') return false
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return false
      this.audioContext = new AudioCtx()

      const playChirp = () => {
        if (!this.audioContext) return
        try {
          const osc = this.audioContext.createOscillator()
          const gain = this.audioContext.createGain()
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(880, this.audioContext.currentTime)
          osc.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.4)
          gain.gain.setValueAtTime(0.4, this.audioContext.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4)
          osc.connect(gain)
          gain.connect(this.audioContext.destination)
          osc.start()
          osc.stop(this.audioContext.currentTime + 0.4)
        } catch {
          // ignore
        }
      }

      playChirp()
      this.synthInterval = window.setInterval(playChirp, 700)
      this.isPlaying = true
      return true
    } catch {
      return false
    }
  }

  /**
   * Stop alarm immediately and clean up all audio streams and timers
   */
  public stop() {
    if (this.audio) {
      try {
        this.audio.pause()
        this.audio.currentTime = 0
      } catch {
        // ignore
      }
    }

    if (this.synthInterval) {
      clearInterval(this.synthInterval)
      this.synthInterval = null
    }

    if (this.audioContext) {
      try {
        this.audioContext.close()
      } catch {
        // ignore
      }
      this.audioContext = null
    }

    this.isPlaying = false
    console.log('[SosAlarm] SOS emergency alarm stopped.')
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }
}

export const sosAlarmPlayer = new SosAlarmAudioPlayer()