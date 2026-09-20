import { afterEach, describe, expect, it, vi } from 'vitest'

/** jsdom has no Web Audio; a stub records what the beep would have wired up. */
function stubAudio() {
  const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  const oscillator = { frequency: { value: 0 }, type: '', connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  gain.connect.mockReturnValue(gain)
  oscillator.connect.mockReturnValue(gain)
  const context = {
    currentTime: 10,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
  }
  // A real class: the adapter calls `new`, which a mocked arrow function cannot take.
  const constructed: unknown[] = []
  class FakeAudioContext {
    currentTime = context.currentTime
    destination = context.destination
    createOscillator = context.createOscillator
    createGain = context.createGain
    constructor() {
      constructed.push(this)
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { constructed, context, oscillator, gain }
}

async function load() {
  vi.resetModules()
  return import('./sound.js')
}

afterEach(() => vi.unstubAllGlobals())

describe('beep', () => {
  it('plays a short sine tone at the asked frequency, reusing one context', async () => {
    const audio = stubAudio()
    const { beep } = await load()
    beep(880, 70)
    beep(300)
    expect(audio.constructed).toHaveLength(1)
    expect(audio.context.createOscillator).toHaveBeenCalledTimes(2)
    expect(audio.oscillator.type).toBe('sine')
    expect(audio.oscillator.frequency.value).toBe(300)
    expect(audio.oscillator.connect).toHaveBeenCalledWith(audio.gain)
    expect(audio.gain.connect).toHaveBeenCalledWith(audio.context.destination)
    expect(audio.oscillator.start).toHaveBeenCalledTimes(2)
    expect(audio.oscillator.stop).toHaveBeenNthCalledWith(1, 10 + 0.07 + 0.02)
    expect(audio.oscillator.stop).toHaveBeenNthCalledWith(2, 10 + 0.09 + 0.02)
  })

  it('is silent without Web Audio, when the context cannot be made, or when playing throws', async () => {
    vi.stubGlobal('AudioContext', undefined)
    let sound = await load()
    expect(() => sound.beep()).not.toThrow()

    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('no audio device')
        }
      },
    )
    sound = await load()
    expect(() => sound.beep()).not.toThrow()

    const audio = stubAudio()
    audio.context.createOscillator.mockImplementation(() => {
      throw new Error('autoplay policy')
    })
    sound = await load()
    expect(() => sound.beep()).not.toThrow()
  })
})

describe('vibrate', () => {
  it('ticks where the device can and stays quiet where it cannot', async () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const sound = await load()
    sound.vibrate(18)
    expect(vibrate).toHaveBeenCalledWith(18)
    vi.stubGlobal('navigator', {})
    expect(() => sound.vibrate()).not.toThrow()
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('not allowed')
      },
    })
    expect(() => sound.vibrate()).not.toThrow()
  })
})
