type SoundName =
  | 'move'
  | 'place'
  | 'win'
  | 'lose'
  | 'draw'
  | 'notify'
  | 'queue'
  | 'error'
  | 'emote'
  | 'levelup'
  | 'score'
  | 'click';

interface Tone {
  freq: number;
  duration: number;
  type: OscillatorType;
  gain?: number;
  /** Frequency to glide to over the duration. */
  slideTo?: number;
  delay?: number;
}

const RECIPES: Record<SoundName, Tone[]> = {
  click: [{ freq: 620, duration: 0.04, type: 'square', gain: 0.05 }],
  move: [{ freq: 380, duration: 0.07, type: 'triangle', gain: 0.09 }],
  place: [
    { freq: 520, duration: 0.07, type: 'triangle', gain: 0.11 },
    { freq: 760, duration: 0.09, type: 'sine', gain: 0.08, delay: 0.05 },
  ],
  score: [{ freq: 880, duration: 0.1, type: 'square', gain: 0.08, slideTo: 1180 }],
  queue: [
    { freq: 440, duration: 0.09, type: 'sine', gain: 0.07 },
    { freq: 660, duration: 0.12, type: 'sine', gain: 0.07, delay: 0.1 },
  ],
  notify: [{ freq: 720, duration: 0.12, type: 'sine', gain: 0.09, slideTo: 960 }],
  emote: [{ freq: 900, duration: 0.08, type: 'sine', gain: 0.06, slideTo: 1200 }],
  error: [{ freq: 200, duration: 0.16, type: 'sawtooth', gain: 0.07, slideTo: 120 }],
  win: [
    { freq: 523, duration: 0.12, type: 'triangle', gain: 0.1 },
    { freq: 659, duration: 0.12, type: 'triangle', gain: 0.1, delay: 0.11 },
    { freq: 784, duration: 0.2, type: 'triangle', gain: 0.11, delay: 0.22 },
    { freq: 1046, duration: 0.3, type: 'sine', gain: 0.1, delay: 0.34 },
  ],
  lose: [
    { freq: 392, duration: 0.16, type: 'triangle', gain: 0.09 },
    { freq: 311, duration: 0.16, type: 'triangle', gain: 0.09, delay: 0.15 },
    { freq: 233, duration: 0.32, type: 'sine', gain: 0.09, delay: 0.3 },
  ],
  draw: [
    { freq: 440, duration: 0.14, type: 'triangle', gain: 0.09 },
    { freq: 440, duration: 0.22, type: 'sine', gain: 0.08, delay: 0.16 },
  ],
  levelup: [
    { freq: 659, duration: 0.1, type: 'square', gain: 0.08 },
    { freq: 880, duration: 0.1, type: 'square', gain: 0.08, delay: 0.09 },
    { freq: 1174, duration: 0.26, type: 'triangle', gain: 0.1, delay: 0.18 },
  ],
};

const STORAGE_KEY = 'mini-arcade.sound';

/**
 * Tiny Web Audio synth — no audio files to download, no licensing, ~2 kB.
 * Everything is generated on demand and the context is created lazily on the
 * first user gesture so browsers never block it.
 */
class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = localStorage.getItem(STORAGE_KEY) !== 'off';

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    if (this.enabled) this.play('click');
    return this.enabled;
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.context.destination);
      return this.context;
    } catch {
      this.enabled = false;
      return null;
    }
  }

  play(name: SoundName): void {
    const context = this.ensure();
    const master = this.master;
    if (!context || !master) return;

    for (const tone of RECIPES[name]) {
      const startAt = context.currentTime + (tone.delay ?? 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.freq, startAt);
      if (tone.slideTo)
        oscillator.frequency.exponentialRampToValueAtTime(tone.slideTo, startAt + tone.duration);

      const peak = tone.gain ?? 0.08;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.duration);

      oscillator.connect(gain).connect(master);
      oscillator.start(startAt);
      oscillator.stop(startAt + tone.duration + 0.02);
    }
  }
}

export const sound = new SoundEngine();
export type { SoundName };
