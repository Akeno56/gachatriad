/** User-supplied recording with a dual-deck crossfade; locally synthesized sound effects. */
import { assetPath } from './connection';
import { AudioTrackCache } from './audio-cache';
export type MusicScene = 'menu' | 'battle';
export type Sound =
  'menu' | 'select' | 'place' | 'capture' | 'combo' | 'victory' | 'defeat' | 'draw' | 'cancel';
export class RetroAudio {
  private tracks = new AudioTrackCache();
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sceneBus: GainNode | null = null;
  private scene: MusicScene = 'menu';
  private loadedScene: MusicScene | null = null;
  private sceneTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
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
  private musicVolume = 0.5;
  private sfxVolume = 0.5;
  setMusicVolume(value: number) {
    this.musicVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
    if (this.musicBus && this.context)
      this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.48, this.context.currentTime, 0.025);
  }
  setSfxVolume(value: number) {
    this.sfxVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
    if (this.sfxBus && this.context)
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.36, this.context.currentTime, 0.025);
  }
  private ensure() {
    if (!this.context) {
      this.context = new AudioContext();
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = this.musicVolume * 0.48;
      this.sceneBus = this.context.createGain();
      this.sceneBus.gain.value = 0;
      this.sceneBus.connect(this.musicBus);
      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = this.sfxVolume * 0.36;
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
      this.generation++;
      this.tracks.cancelPending();
      if (this.sceneTimer) clearTimeout(this.sceneTimer);
      this.sceneTimer = null;
      this.decks.forEach((d) => d.pause());
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const ctx = this.ensure();
    if (!this.decks.length)
      for (let i = 0; i < 2; i++) {
        const audio = new Audio();
        audio.preload = 'none';
        audio.hidden = true;
        audio.dataset.bgmTrack = String(i);
        document.body.appendChild(audio);
        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 1 : 0;
        ctx.createMediaElementSource(audio).connect(gain);
        gain.connect(this.sceneBus!);
        this.decks.push(audio);
        this.gains.push(gain);
      }
    if (this.loadedScene !== this.scene) {
      if (this.visible) void this.loadScene();
      return;
    }
    this.fadeSceneIn();
    if (this.visible) {
      void this.decks[this.active].play().catch(() => {});
      if (this.fading) void this.decks[this.fading.to].play().catch(() => {});
    }
    if (!this.timer) this.timer = setInterval(() => this.crossfade(), 100);
  }
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (!this.musicEnabled || !this.context || !this.sceneBus || !this.visible) return;
    if (this.sceneTimer) clearTimeout(this.sceneTimer);
    const now = this.context.currentTime;
    this.sceneBus.gain.cancelScheduledValues(now);
    this.sceneBus.gain.setValueAtTime(this.sceneBus.gain.value, now);
    this.sceneBus.gain.linearRampToValueAtTime(0, now + 0.6);
    this.sceneTimer = setTimeout(() => {
      this.sceneTimer = null;
      if (!this.musicEnabled) return;
      void this.loadScene();
    }, 650);
  }
  private fadeSceneIn() {
    if (!this.context || !this.sceneBus) return;
    const now = this.context.currentTime;
    this.sceneBus.gain.cancelScheduledValues(now);
    this.sceneBus.gain.setValueAtTime(0, now);
    this.sceneBus.gain.linearRampToValueAtTime(1, now + 1.4);
  }
  private async loadScene() {
    const generation = ++this.generation;
    const scene = this.scene;
    this.tracks.cancelPending();
    this.loadedScene = null;
    this.fading = null;
    this.starting = false;
    this.active = 0;
    const path =
      scene === 'battle' ? '/audio/queen-of-cards.mp3' : '/audio/shuffle-or-boogie-ambient.mp3';
    this.decks.forEach((deck) => deck.pause());
    try {
      const localURL = await this.tracks.get(assetPath(path));
      if (generation !== this.generation || !this.musicEnabled || !this.visible || !this.context)
        return;
      this.decks.forEach((deck, i) => {
        deck.src = localURL;
        deck.dataset.bgmScene = scene;
        this.gains[i].gain.cancelScheduledValues(this.context!.currentTime);
        this.gains[i].gain.value = i === 0 ? 1 : 0;
        deck.load();
      });
      this.loadedScene = scene;
      this.fadeSceneIn();
      void this.decks[0].play().catch(() => {});
      if (!this.timer) this.timer = setInterval(() => this.crossfade(), 100);
    } catch {
      /* Music failure must never block game requests or input. */
    }
  }
  private crossfade() {
    const ctx = this.context;
    if (
      !ctx ||
      !this.musicEnabled ||
      !this.visible ||
      this.loadedScene !== this.scene ||
      this.sceneTimer ||
      ctx.state !== 'running'
    )
      return;
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
    const generation = this.generation;
    const from = this.active,
      to = 1 - from,
      incoming = this.decks[to];
    incoming.currentTime = 0;
    void incoming
      .play()
      .then(() => {
        if (generation !== this.generation) return;
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
      this.generation++;
      this.tracks.cancelPending();
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.decks.forEach((d) => d.pause());
      void this.context.suspend().catch(() => {});
    } else if (this.musicEnabled) {
      void this.context
        .resume()
        .then(() => {
          if (this.loadedScene !== this.scene) {
            void this.loadScene();
            return;
          }
          void this.decks[this.active]?.play().catch(() => {});
          if (this.fading) void this.decks[this.fading.to].play().catch(() => {});
          if (!this.timer) this.timer = setInterval(() => this.crossfade(), 100);
        })
        .catch(() => {});
    }
  }
  dispose() {
    this.musicEnabled = false;
    this.generation++;
    if (this.sceneTimer) clearTimeout(this.sceneTimer);
    this.sceneTimer = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.decks.forEach((d) => {
      d.pause();
      d.removeAttribute('src');
      d.load();
      d.remove();
    });
    this.decks = [];
    this.tracks.dispose();
    void this.context?.close().catch(() => {});
  }
}
