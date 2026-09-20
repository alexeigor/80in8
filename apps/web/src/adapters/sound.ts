/**
 * One short beep, generated on the fly. No audio file means no extra request and no
 * bytes in the precache; the whole feature is off by default.
 */

type AudioContextCtor = typeof AudioContext

let context: AudioContext | null = null

function ctx(): AudioContext | null {
  try {
    const Ctor: AudioContextCtor | undefined = typeof AudioContext !== 'undefined' ? AudioContext : undefined
    if (!Ctor) return null
    context ??= new Ctor()
    return context
  } catch {
    return null
  }
}

export function beep(frequency = 880, ms = 90): void {
  const audio = ctx()
  if (!audio) return
  try {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    gain.gain.setValueAtTime(0.0001, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + ms / 1000 + 0.02)
  } catch {
    /* Autoplay policy, no output device: silence is an acceptable failure. */
  }
}

export function vibrate(ms = 10): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignored */
  }
}
