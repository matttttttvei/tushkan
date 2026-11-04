class SoundEngine {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  public muted = false;

  public unlockFromGesture(): void {
    try {
      if (this.ac) {
        if (this.ac.state === 'suspended') {
          this.ac.resume().catch(() => {});
        }
        return;
      }
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ac.destination);
      if (this.ac.state === 'suspended') {
        this.ac.resume().catch(() => {});
      }
    } catch {
      this.ac = null;
    }
  }

  public init(): void {
    // Only resume if already created by a user gesture
    if (this.ac && this.ac.state === 'suspended') {
      this.ac.resume().catch(() => {});
    }
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.12,
    slideTo?: number | null,
    delay = 0
  ): void {
    if (!this.ac || !this.master || this.muted || this.ac.state !== 'running') return;
    try {
      const ac = this.ac;
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch {
      // Ignore audio errors on restricted autoplay
    }
  }

  public noise(dur: number, freq = 900, gain = 0.18): void {
    if (!this.ac || !this.master || this.muted || this.ac.state !== 'running') return;
    try {
      const ac = this.ac;
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    } catch {
      // Ignore audio errors
    }
  }

  public hop(): void {
    const jitter = 0.94 + Math.random() * 0.12;
    this.tone(195 * jitter, 0.1, 'sine', 0.1, 96 * jitter);
    this.noise(0.07, 820, 0.06);
  }

  public land(): void {
    const jitter = 0.93 + Math.random() * 0.14;
    this.noise(0.055, 520 * jitter, 0.05);
  }

  public perfect(combo = 1): void {
    const k = Math.min(6, combo || 1);
    this.tone(620 + k * 45, 0.13, 'triangle', 0.1);
    this.tone(930 + k * 60, 0.16, 'sine', 0.075, null, 0.055);
  }

  public stumble(): void {
    this.noise(0.3, 460, 0.26);
    this.tone(150, 0.24, 'sawtooth', 0.09, 62);
  }

  public count(last: boolean): void {
    this.tone(last ? 900 : 520, last ? 0.32 : 0.12, 'square', 0.07);
  }

  public finish(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      this.tone(f, 0.34, 'triangle', 0.1, null, i * 0.105);
    });
  }
}

export const Sfx = new SoundEngine();
