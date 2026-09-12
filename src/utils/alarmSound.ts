/**
 * Universal Loud SOS Emergency Alarm Audio Controller
 * Plays single-shot emergency beep/alarm on new real-time SOS events specifically for Dispatcher.
 * - Single-shot audio playback (no continuous loop)
 * - Event ID deduplication to prevent repeated beeps from re-renders or polling
 * - Graceful browser autoplay restriction fallback
 * - Clean pause/stop controls
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
  private playedSosEventIds: Set<string> = new Set()

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audio = new Audio('/sounds/sos-alarm.mp3')
        this.audio.loop = false
        this.audio.preload = 'none'
        this.audio.addEventListener('ended', () => {
          this.isPlaying = false
        })
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
   * Play emergency alarm sound ONCE for a specific new SOS event ID (Dispatcher only).
   * Deduplicates by eventId to ensure re-renders and polling never restart the alarm.
   */
  public async playOnceForEvent(eventId: string): Promise<boolean> {
    if (!eventId) return false
    if (!isDispatcherPortal()) {
      if (this.isPlaying) this.stop()
      return false
    }
    if (this.playedSosEventIds.has(eventId)) {
      return false
    }
    this.playedSosEventIds.add(eventId)
    return this.playSingleShot()
  }

  /**
   * Plays single-shot emergency alarm (no infinite loop).
   * STRICT ENFORCEMENT: Only permits playback if currently inside the Dispatcher portal.
   */
  public async playSingleShot(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    if (!isDispatcherPortal()) {
      if (this.isPlaying) this.stop()
      return false
    }

    if (this.audio) {
      try {
        this.audio.loop = false
        this.audio.currentTime = 0
        this.audio.volume = 0.9
        const playPromise = this.audio.play()
        if (playPromise !== undefined) {
          await playPromise
        }
        this.isPlaying = true
        console.log('[SosAlarm] Playing single-shot SOS emergency alarm in Dispatcher Portal')
        return true
      } catch (err: any) {
        // Browser autoplay restriction or file error — fallback to single-shot Web Audio chirp
        return this.playSingleFallbackChirp()
      }
    } else {
      return this.playSingleFallbackChirp()
    }
  }

  /**
   * Backward-compatible play alias (plays single shot)
   */
  public async play(): Promise<boolean> {
    return this.playSingleShot()
  }

  /**
   * Web Audio API single-shot siren chirp fallback (2 brief pulses, auto-stops in 0.7s)
   */
  private playSingleFallbackChirp(): boolean {
    if (typeof window === 'undefined') return false
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return false
      const ctx = new AudioCtx()
      const now = ctx.currentTime

      // Pulse 1 (880Hz -> 440Hz, 300ms)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sawtooth'
      osc1.frequency.setValueAtTime(880, now)
      osc1.frequency.exponentialRampToValueAtTime(440, now + 0.3)
      gain1.gain.setValueAtTime(0.3, now)
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.3)

      // Pulse 2 (880Hz -> 440Hz, 300ms)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sawtooth'
      osc2.frequency.setValueAtTime(880, now + 0.35)
      osc2.frequency.exponentialRampToValueAtTime(440, now + 0.65)
      gain2.gain.setValueAtTime(0.3, now + 0.35)
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.65)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.35)
      osc2.stop(now + 0.65)

      this.isPlaying = true

      setTimeout(() => {
        try {
          ctx.close()
        } catch {}
        this.isPlaying = false
      }, 800)

      return true
    } catch {
      return false
    }
  }

  /**
   * Stop alarm immediately and clean up
   */
  public stop() {
    if (this.audio) {
      try {
        this.audio.pause()
        this.audio.currentTime = 0
      } catch {}
    }
    this.isPlaying = false
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }
}

export const sosAlarmPlayer = new SosAlarmAudioPlayer()