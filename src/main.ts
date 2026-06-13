// Application entry point: wires the DOM controls to the parser, renderer, and player.

import { Player } from "./engine/player";
import { Renderer } from "./render/renderer";
import { parseMaidata } from "./simai/parser";
import type { Chart } from "./simai/types";

const canvas = document.getElementById("playfield") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const player = new Player(renderer);

const els = {
  chartFile: document.getElementById("chart-file") as HTMLInputElement,
  audioFile: document.getElementById("audio-file") as HTMLInputElement,
  difficulty: document.getElementById("difficulty") as HTMLSelectElement,
  meta: document.getElementById("meta") as HTMLDivElement,
  play: document.getElementById("play") as HTMLButtonElement,
  seek: document.getElementById("seek") as HTMLInputElement,
  time: document.getElementById("time") as HTMLDivElement,
  speed: document.getElementById("speed") as HTMLInputElement,
  speedVal: document.getElementById("speed-val") as HTMLSpanElement,
  warnings: document.getElementById("warnings") as HTMLDivElement,
};

// Holds the most recently loaded maidata text so changing difficulty re-parses it.
let rawMaidata = "";
let availableDifficulties: number[] = [];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function loadChart(difficulty?: number): void {
  if (!rawMaidata) return;
  const chart = parseMaidata(rawMaidata, difficulty);
  player.setChart(chart);
  showMeta(chart);
  showWarnings(chart);
}

function showMeta(chart: Chart): void {
  const rows: Array<[string, string | undefined]> = [
    ["Title", chart.meta.title],
    ["Artist", chart.meta.artist],
    ["Charter", chart.meta.designer],
    ["Level", chart.meta.level],
    ["BPM", chart.meta.bpm ? String(chart.meta.bpm) : undefined],
    ["Notes", String(chart.notes.length)],
    ["Length", formatTime(chart.duration)],
  ];
  els.meta.innerHTML = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="meta-line"><span>${k}</span><span>${escapeHtml(v!)}</span></div>`)
    .join("");
}

function showWarnings(chart: Chart): void {
  els.warnings.textContent = chart.warnings.length ? chart.warnings.join("\n") : "None";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function rebuildDifficultyOptions(): void {
  const m = new Map<number, string>();
  for (const part of rawMaidata.split(/^&/m)) {
    const match = /^inote_(\d+)\s*=/.exec(part);
    if (match) m.set(Number(match[1]), `inote_${match[1]}`);
  }
  availableDifficulties = [...m.keys()].sort((a, b) => a - b);
  const labels: Record<number, string> = { 1: "Basic", 2: "Advanced", 3: "Expert", 4: "Master", 5: "Re:Master" };
  els.difficulty.innerHTML = availableDifficulties
    .map((d) => `<option value="${d}">${labels[d] ?? `Chart ${d}`}</option>`)
    .join("");
  if (availableDifficulties.length) {
    els.difficulty.value = String(availableDifficulties[availableDifficulties.length - 1]);
  }
}

// --- Events -------------------------------------------------------------

els.chartFile.addEventListener("change", async () => {
  const file = els.chartFile.files?.[0];
  if (!file) return;
  rawMaidata = await file.text();
  rebuildDifficultyOptions();
  const sel = els.difficulty.value ? Number(els.difficulty.value) : undefined;
  loadChart(sel);
});

els.audioFile.addEventListener("change", () => {
  const file = els.audioFile.files?.[0];
  if (!file) return;
  player.setAudio(URL.createObjectURL(file));
});

els.difficulty.addEventListener("change", () => {
  loadChart(Number(els.difficulty.value));
});

els.play.addEventListener("click", () => player.toggle());

els.seek.addEventListener("input", () => {
  const frac = Number(els.seek.value) / 1000;
  player.seek(frac * player.duration);
});

els.speed.addEventListener("input", () => {
  renderer.options.approachTime = Number(els.speed.value);
  els.speedVal.textContent = Number(els.speed.value).toFixed(2);
  player.renderFrame();
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    player.toggle();
  }
});

window.addEventListener("resize", () => {
  renderer.resize();
  player.renderFrame();
});

let seeking = false;
els.seek.addEventListener("pointerdown", () => (seeking = true));
els.seek.addEventListener("pointerup", () => (seeking = false));

player.onTick = (state) => {
  els.play.textContent = state.playing ? "⏸ Pause" : "▶ Play";
  els.time.textContent = `${formatTime(state.time)} / ${formatTime(state.duration)}`;
  if (!seeking) els.seek.value = String((state.time / Math.max(state.duration, 0.001)) * 1000);
};

// --- Bootstrap with a bundled sample so there is something to look at ----

async function loadSample(): Promise<void> {
  try {
    const res = await fetch("samples/sample.txt");
    if (!res.ok) return;
    rawMaidata = await res.text();
    rebuildDifficultyOptions();
    loadChart();
  } catch {
    /* no sample available; user can load their own */
  }
}

void loadSample();
player.renderFrame();
