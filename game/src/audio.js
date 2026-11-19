// All sound is synthesized with WebAudio: no audio files, no network.
// The context is created on the first user gesture; shot mode never starts it.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.musicTimer = null;
    this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; this.sirenGain = null;
    this.musicStep = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      // Engine: low sawtooth + gain that follows speed.
      this.engineOsc = c.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(c.destination);
      this.engineOsc.start();
      // Siren: triangle that wails between two tones while wanted.
      this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 750;
      this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(c.destination);
      this.sirenOsc.start();
      this.startMusic();
    } catch { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.suspend();
    if (!m && this.ctx) this.ctx.resume();
  }
  setEngine(on, speed01) {
    if (!this.ctx || this.muted) return;
    this.engineGain.gain.value = on ? 0.02 + speed01 * 0.05 : 0;
    this.engineOsc.frequency.value = 50 + speed01 * 130;
  }
  setSiren(on, t) {
    if (!this.ctx || this.muted) return;
    this.sirenGain.gain.value = on ? 0.016 : 0;
    if (on) this.sirenOsc.frequency.value = 680 + 220 * Math.sin(t * 2.4);
  }
  blip(freq, dur, type = 'sine', vol = 0.08) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  shot() { this.noise(0.14, 0.3, 900); this.blip(160, 0.08, 'square', 0.06); }
  punch() { this.noise(0.08, 0.16, 500); }
  pickup() { this.blip(660, 0.09); setTimeout(() => this.blip(990, 0.12), 70); }
  crash() { this.noise(0.25, 0.3, 400); }
  mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.09), i * 110)); }
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.08), i * 130)); }
  // Simple sunset-drive bassline loop: A minor groove, one bar per second.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 0, 55, 65.4, 55, 0, 49, 58.3];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (f) this.blip(f, 0.42, 'triangle', 0.035);
      if (this.musicStep % 4 === 0) this.blip(220, 0.1, 'sine', 0.015);
    }, 300);
  }
}
