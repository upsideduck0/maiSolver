// Playback engine: owns the clock, optional audio, and the animation loop.
//
// When an audio track is loaded, the clock follows `audio.currentTime` so notes
// stay in sync with the music. Without audio (chart-only preview) the clock is
// advanced manually each frame, so the viewer still works for charts that have
// no accompanying track.

import type { Renderer } from "../render/renderer";
import type { Chart } from "../simai/types";

export interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
}

export class Player {
  private audio: HTMLAudioElement | null = null;
  private chart: Chart | null = null;
  private clock = 0;
  private playing = false;
  private lastFrame = 0;
  private rafId = 0;

  /** Called every frame with the current state, for UI updates. */
  onTick: ((state: PlayerState) => void) | null = null;

  constructor(private readonly renderer: Renderer) {}

  setChart(chart: Chart): void {
    this.chart = chart;
    this.renderer.setChart(chart);
    this.seek(0);
  }

  /** Attach an audio file (object URL or path). Replaces any existing track. */
  setAudio(src: string): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }
    this.audio = new Audio(src);
    this.audio.preload = "auto";
  }

  clearAudio(): void {
    if (this.audio) this.audio.pause();
    this.audio = null;
  }

  get duration(): number {
    const audioDur = this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    return Math.max(audioDur, this.chart?.duration ?? 0) + 0.5;
  }

  get currentTime(): number {
    return this.clock;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastFrame = performance.now();
    if (this.audio) {
      this.audio.currentTime = Math.max(0, this.clock);
      void this.audio.play().catch(() => {
        /* autoplay restrictions — the manual clock still advances */
      });
    }
    this.loop();
  }

  pause(): void {
    this.playing = false;
    if (this.audio) this.audio.pause();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.renderFrame();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    this.clock = Math.max(0, Math.min(time, this.duration));
    if (this.audio) this.audio.currentTime = this.clock;
    this.renderFrame();
  }

  /** Render a single frame at the current clock without advancing playback. */
  renderFrame(): void {
    this.renderer.render(this.clock);
    this.onTick?.({ time: this.clock, duration: this.duration, playing: this.playing });
  }

  private loop = (): void => {
    if (!this.playing) return;
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    if (this.audio && !this.audio.paused) {
      this.clock = this.audio.currentTime;
    } else {
      this.clock += dt;
    }

    if (this.clock >= this.duration) {
      this.clock = this.duration;
      this.renderFrame();
      this.pause();
      return;
    }

    this.renderFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };
}
