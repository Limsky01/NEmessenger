let audioCtx = null

const ensureContext = () => {
  if (typeof window === 'undefined') return null
  if (audioCtx) return audioCtx
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  try {
    audioCtx = new AudioContextClass()
  } catch (err) {
    console.warn('audio context init failed', err)
    audioCtx = null
  }
  return audioCtx
}

const resumeContext = async (ctx) => {
  if (!ctx) return
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try {
      await ctx.resume()
    } catch (err) {
      console.warn('audio context resume failed', err)
    }
  }
}

export const playVoiceJoinSound = async () => {
  const ctx = ensureContext()
  if (!ctx) return
  await resumeContext(ctx)
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(660, now)
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.45)
}

export default {
  playVoiceJoinSound,
}
