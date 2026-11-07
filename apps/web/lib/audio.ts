/** User-supplied recording with a dual-deck crossfade; locally synthesized sound effects. */
import { assetPath } from './connection';
export type Sound =
  'menu' | 'select' | 'place' | 'capture' | 'combo' | 'victory' | 'defeat' | 'draw' | 'cancel';
export class RetroAudio {
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private decks: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private active = 0;
  private fading: { from: number; to: number; start: number; duration: number } | null = null;
  private visible = true;
  private starting = false;
  private musicEnabled = false;
  private sfxEnabled = true;
  private ensure() {
    if (!this.context) {
      this.context = new AudioContext();
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.34;
      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = 0.25;
      const compressor = this.context.createDynamicsCompressor();
      this.musicBus.connect(compressor);
      this.sfxBus.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    return this.context;
  }
  private tone(
    note: number,
    time: number,
    duration: number,
    volume: number,
    bus: GainNode,
    type: OscillatorType = 'triangle',
  ) {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(env);
    env.connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
  setSfx(enabled: boolean) {
    this.sfxEnabled = enabled;
  }
  setMusic(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.decks.forEach((d) => d.pause());
      return;
    }
    const ctx = this.ensure();
    if (!this.decks.length)
      for (let i = 0; i < 2; i++) {
        const audio = new Audio(assetPath('/audio/queen-of-cards.mp3'));
        audio.preload = 'auto';
        audio.hidden = true;
        audio.dataset.bgmTrack = String(i);
        document.body.appendChild(audio);
        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 1 : 0;
        ctx.createMediaElementSource(audio).connect(gain);
        gain.connect(this.musicBus!);
        this.decks.push(audio);
        this.gains.push(gain);
      }
    if (this.visible) {
      void this.decks[this.active].play().catch(() => {});
      if (this.fading) void this.decks[this.fading.to].play().catch(() => {});
    }
    if (!this.timer) this.timer = setInterval(() => this.crossfade(), 100);
  }
  private crossfade() {
    const ctx = this.context;
    if (!ctx || !this.musicEnabled || !this.visible || ctx.state !== 'running') return;
    if (this.fading) {
      const f = this.fading;
      if (ctx.currentTime >= f.start + f.duration) {
        this.decks[f.from].pause();
        this.decks[f.from].currentTime = 0;
        this.active = f.to;
        this.fading = null;
      }
      return;
    }
    const outgoing = this.decks[this.active];
    if (
      this.starting ||
      !Number.isFinite(outgoing.duration) ||
      outgoing.currentTime < outgoing.duration - 6.05
    )
      return;
    this.starting = true;
    const from = this.active,
      to = 1 - from,
      incoming = this.decks[to];
    incoming.currentTime = 0;
    void incoming
      .play()
      .then(() => {
        if (!this.musicEnabled || !this.visible) {
          incoming.pause();
          return;
        }
        const start = ctx.currentTime,
          duration = Math.max(0.1, Math.min(6, outgoing.duration - outgoing.currentTime));
        this.fading = { from, to, start, duration };
        const fadeIn = new Float32Array(64),
          fadeOut = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
          fadeIn[i] = Math.sin(((i / 63) * Math.PI) / 2);
          fadeOut[i] = Math.cos(((i / 63) * Math.PI) / 2);
        }
        this.gains[from].gain.cancelScheduledValues(start);
        this.gains[to].gain.cancelScheduledValues(start);
        this.gains[from].gain.setValueCurveAtTime(fadeOut, start, duration);
        this.gains[to].gain.setValueCurveAtTime(fadeIn, start, duration);
      })
      .catch(() => {})
      .finally(() => {
        this.starting = false;
      });
  }
  play(sound: Sound) {
    if (!this.sfxEnabled) return;
    const ctx = this.ensure();
    const now = ctx.currentTime + 0.01;
    const phrases: Record<Sound, number[]> = {
      menu: [79],
      select: [76, 83],
      place: [48, 60],
      capture: [72, 79, 84],
      combo: [72, 76, 79, 84, 88, 91],
      victory: [72, 76, 79, 84, 79, 84, 88],
      defeat: [64, 62, 59, 52],
      draw: [72, 76, 74, 72],
      cancel: [67, 60],
    };
    const notes = phrases[sound];
    const duration = sound === 'victory' || sound === 'defeat' ? 0.24 : 0.07;
    notes.forEach((note, i) =>
      this.tone(
        note,
        now + i * duration,
        duration * 2,
        0.24,
        this.sfxBus!,
        sound === 'place' ? 'triangle' : 'square',
      ),
    );
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.context) return;
    if (!visible) {
      this.decks.forEach((d) => d.pause());
      void this.context.suspend().catch(() => {});
    } else if (this.musicEnabled) {
      void this.context
        .resume()
        .then(() => {
          void this.decks[this.active]?.play().catch(() => {});
          if (this.fading) void this.decks[this.fading.to].play().catch(() => {});
        })
        .catch(() => {});
    }
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.decks.forEach((d) => {
      d.pause();
      d.removeAttribute('src');
      d.load();
      d.remove();
    });
    this.decks = [];
    void this.context?.close().catch(() => {});
  }
}
