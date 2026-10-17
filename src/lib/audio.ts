/* Web Audio helpers: a gentle chime and offline ambient sound generators. */

let ctx: AudioContext | null = null

export function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Soft three-note bell. */
export function playChime(volume = 0.6): void {
  if (volume <= 0) return
  try {
    const ac = audioContext()
    const now = ac.currentTime
    ;[659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.18
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25 * volume, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      osc.connect(gain).connect(ac.destination)
      osc.start(t)
      osc.stop(t + 1.7)
    })
  } catch {
    // audio unavailable
  }
}

export type AmbientId = 'rain' | 'ocean' | 'wind' | 'brown' | 'white'

export const AMBIENT_SOUNDS: { id: AmbientId; name: string; emoji: string; hint: string }[] = [
  { id: 'rain', name: 'Rain', emoji: '🌧️', hint: 'Steady soft rainfall' },
  { id: 'ocean', name: 'Ocean', emoji: '🌊', hint: 'Slow rolling waves' },
  { id: 'wind', name: 'Wind', emoji: '🍃', hint: 'Breeze through trees' },
  { id: 'brown', name: 'Deep noise', emoji: '🟤', hint: 'Warm brown noise' },
  { id: 'white', name: 'White noise', emoji: '⚪', hint: 'Masks chatter' },
]

type NoiseKind = 'white' | 'pink' | 'brown'
const buffers = new Map<NoiseKind, AudioBuffer>()

function noiseBuffer(ac: AudioContext, kind: NoiseKind): AudioBuffer {
  const cached = buffers.get(kind)
  if (cached) return cached
  const length = ac.sampleRate * 8
  const buf = ac.createBuffer(2, length, ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') data[i] = w
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.5
      }
    }
    // Crossfade the loop seam.
    const fade = Math.floor(ac.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      const t = i / fade
      data[i] = data[i] * t + data[length - fade + i] * (1 - t)
    }
  }
  buffers.set(kind, buf)
  return buf
}

interface Voice {
  out: GainNode
  stop: () => void
}

function lfo(ac: AudioContext, freq: number, depth: number, target: AudioParam): OscillatorNode {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.frequency.value = freq
  g.gain.value = depth
  osc.connect(g).connect(target)
  osc.start()
  return osc
}

function buildVoice(ac: AudioContext, id: AmbientId): Voice {
  const out = ac.createGain()
  out.gain.value = 0
  out.connect(ac.destination)
  const sources: AudioScheduledSourceNode[] = []
  const src = ac.createBufferSource()
  src.loop = true
  sources.push(src)
  const shape = ac.createGain()

  if (id === 'rain') {
    src.buffer = noiseBuffer(ac, 'pink')
    const hp = ac.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 450
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 7000
    shape.gain.value = 0.9
    src.connect(hp).connect(lp).connect(shape).connect(out)
    sources.push(lfo(ac, 0.13, 0.08, shape.gain))
  } else if (id === 'ocean') {
    src.buffer = noiseBuffer(ac, 'brown')
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    shape.gain.value = 0.55
    src.connect(lp).connect(shape).connect(out)
    sources.push(lfo(ac, 0.085, 0.45, shape.gain))
    sources.push(lfo(ac, 0.085, 350, lp.frequency))
  } else if (id === 'wind') {
    src.buffer = noiseBuffer(ac, 'pink')
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 600
    bp.Q.value = 0.7
    shape.gain.value = 1.4
    src.connect(bp).connect(shape).connect(out)
    sources.push(lfo(ac, 0.05, 350, bp.frequency))
    sources.push(lfo(ac, 0.07, 0.5, shape.gain))
  } else if (id === 'brown') {
    src.buffer = noiseBuffer(ac, 'brown')
    shape.gain.value = 0.9
    src.connect(shape).connect(out)
  } else {
    src.buffer = noiseBuffer(ac, 'white')
    shape.gain.value = 0.18
    src.connect(shape).connect(out)
  }
  src.start()

  return {
    out,
    stop: () => {
      const t = ac.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setTargetAtTime(0, t, 0.15)
      setTimeout(() => {
        sources.forEach((s) => {
          try {
            s.stop()
          } catch {
            // already stopped
          }
        })
        out.disconnect()
      }, 800)
    },
  }
}

const voices = new Map<AmbientId, Voice>()

export function setAmbient(id: AmbientId, volume: number | null): void {
  const ac = audioContext()
  const existing = voices.get(id)
  if (volume === null || volume <= 0) {
    if (existing) {
      existing.stop()
      voices.delete(id)
    }
    return
  }
  const voice = existing ?? buildVoice(ac, id)
  voices.set(id, voice)
  voice.out.gain.setTargetAtTime(volume, ac.currentTime, 0.3)
}

export function stopAllAmbient(): void {
  for (const id of [...voices.keys()]) setAmbient(id, null)
}

/* ---------------- Alarm sounds ---------------- */

type AlarmSoundId = 'chime' | 'rise' | 'birds' | 'beep' | 'digital'

interface Pattern {
  period: number
  play: (tone: ToneFn, t: number) => void
}

type ToneFn = (freq: number, t: number, dur: number, opts?: { type?: OscillatorType; peak?: number; glideTo?: number; hold?: boolean }) => void

const PATTERNS: Record<AlarmSoundId, Pattern> = {
  chime: {
    period: 2.6,
    play: (tone, t) => {
      tone(659.25, t, 1.6)
      tone(783.99, t + 0.2, 1.6)
      tone(1046.5, t + 0.4, 1.8)
    },
  },
  rise: {
    period: 3,
    play: (tone, t) => {
      tone(392, t, 1.6, { glideTo: 784, peak: 0.25 })
      tone(587.33, t + 0.1, 1.5, { glideTo: 1174.66, peak: 0.1 })
    },
  },
  birds: {
    period: 2.2,
    play: (tone, t) => {
      ;[0, 0.12, 0.24].forEach((o) => tone(2600, t + o, 0.09, { glideTo: 3900, peak: 0.16 }))
      ;[0.9, 1.02].forEach((o) => tone(3200, t + o, 0.11, { glideTo: 2400, peak: 0.14 }))
    },
  },
  digital: {
    period: 1,
    play: (tone, t) => {
      tone(1000, t, 0.12, { type: 'triangle', peak: 0.3, hold: true })
      tone(1320, t + 0.16, 0.12, { type: 'triangle', peak: 0.3, hold: true })
    },
  },
  beep: {
    period: 1.2,
    play: (tone, t) => {
      ;[0, 0.18, 0.36, 0.54].forEach((o) => tone(880, t + o, 0.1, { type: 'square', peak: 0.12, hold: true }))
    },
  },
}

/** Plays an alarm on a loop until the returned stop function is called. */
export function startAlarmSound(sound: AlarmSoundId, volume: number, gentleStart: boolean): () => void {
  let ac: AudioContext
  try {
    ac = audioContext()
  } catch {
    return () => {}
  }
  const master = ac.createGain()
  master.connect(ac.destination)
  const v = Math.max(0.05, Math.min(1, volume))
  const start = ac.currentTime
  if (gentleStart) {
    master.gain.setValueAtTime(v * 0.15, start)
    master.gain.linearRampToValueAtTime(v, start + 30)
  } else master.gain.setValueAtTime(v, start)

  const tone: ToneFn = (freq, t, dur, opts = {}) => {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t)
    if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur)
    const peak = opts.peak ?? 0.3
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
    if (opts.hold) g.gain.setValueAtTime(peak, t + dur - 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  const pattern = PATTERNS[sound] ?? PATTERNS.chime
  let next = ac.currentTime + 0.05
  const schedule = () => {
    while (next < ac.currentTime + 3) {
      pattern.play(tone, next)
      next += pattern.period
    }
  }
  schedule()
  const id = window.setInterval(schedule, 400)

  return () => {
    window.clearInterval(id)
    const t = ac.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setTargetAtTime(0, t, 0.04)
    window.setTimeout(() => master.disconnect(), 400)
  }
}

/** A short sample of an alarm sound. */
export function previewAlarmSound(sound: AlarmSoundId, volume: number): () => void {
  const stop = startAlarmSound(sound, volume, false)
  const id = window.setTimeout(stop, 2800)
  return () => {
    window.clearTimeout(id)
    stop()
  }
}
