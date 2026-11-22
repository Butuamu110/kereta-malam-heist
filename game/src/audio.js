// Suara synth WebAudio sendiri — tanpa file audio eksternal.
// Deru kereta (noise rendah berulang), langkah, koin, sting alarm,
// denting peti emas, peluit kemenangan. M = mute.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let rumbleNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol || 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* suara tidak pernah mematikan game */ }
  }

  function noiseBurst(dur, vol, lowFreq) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq || 800;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch { /* abaikan */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    step() { noiseBurst(0.05, 0.06, 500); },
    coin() { tone(1320, 0.12, 'triangle', 0.18, 1760); tone(1760, 0.18, 'triangle', 0.12, 2200); },
    loot() {
      tone(523, 0.15, 'triangle', 0.22);
      setTimeout(() => tone(659, 0.15, 'triangle', 0.22), 90);
      setTimeout(() => tone(784, 0.3, 'triangle', 0.24), 180);
      noiseBurst(0.2, 0.08, 4000);
    },
    door() { tone(180, 0.35, 'sawtooth', 0.08, 320); noiseBurst(0.25, 0.1, 600); },
    alarmSting() {
      tone(880, 0.25, 'square', 0.12, 660);
      setTimeout(() => tone(880, 0.25, 'square', 0.12, 660), 260);
    },
    caught() { tone(220, 0.5, 'sawtooth', 0.2, 110); noiseBurst(0.3, 0.15, 400); },
    suspicious() { tone(660, 0.15, 'square', 0.08, 520); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.22), i * 140));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.18), i * 160));
    },
    startRumble() {
      if (!ensure() || rumbleNodes) return;
      try {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i += 1) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 120;
        const gain = ctx.createGain();
        gain.gain.value = 0.12;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.05;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start();
        lfo.start();
        rumbleNodes = { src, lfo, gain };
      } catch { /* abaikan */ }
    },
    setRumble(level) {
      if (rumbleNodes) rumbleNodes.gain.gain.value = 0.06 + 0.1 * level;
    },
  };
}
