// Procedural audio synth -> 16-bit PCM WAV. No deps.
// Generates a dark-tech ambient bed + UI/coin SFX for the Talos demo.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
mkdirSync(OUT, { recursive: true });

const clamp = (x) => Math.max(-1, Math.min(1, x));
const tri = (p) => 2 * Math.abs(2 * (p - Math.floor(p + 0.5))) - 1;
function buf(sec) {
  return new Float32Array(Math.ceil(sec * SR));
}
// simple 1-pole lowpass
function lowpass(data, cutoff) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  let y = 0;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    y = y + a * (data[i] - y);
    out[i] = y;
  }
  return out;
}
function write(name, data, gain = 0.9) {
  // normalize to gain
  let peak = 1e-6;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const k = (gain / peak) * 32767;
  const bytes = Buffer.alloc(44 + data.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + data.length * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) {
    bytes.writeInt16LE(Math.round(clamp((data[i] * k) / 32767) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), bytes);
  console.log("wrote", name, (data.length / SR).toFixed(2) + "s");
}
const env = (t, len, a, r) => {
  // attack/release envelope, t and len in seconds
  if (t < a) return t / a;
  if (t > len - r) return Math.max(0, (len - t) / r);
  return 1;
};

// ---- 1. Ambient bed (62s): detuned drone, slow filter sweep, sparse sub pulse ----
function ambient() {
  const len = 62;
  const d = buf(len);
  const roots = [55, 82.41, 110, 164.81]; // A1, E2, A2, E3
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let v = 0; v < roots.length; v++) {
      const det = 1 + 0.004 * Math.sin(2 * Math.PI * (0.05 + v * 0.017) * t);
      s += Math.sin(2 * Math.PI * roots[v] * det * t) * (0.16 - v * 0.02);
      s += Math.sin(2 * Math.PI * roots[v] * 2 * det * t) * 0.03;
    }
    // slow breathing amplitude
    const breathe = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.04 * t);
    d[i] = s * breathe;
  }
  let out = lowpass(d, 900);
  // add a slow-moving high shimmer
  const sh = buf(len);
  for (let i = 0; i < sh.length; i++) {
    const t = i / SR;
    sh[i] = (Math.sin(2 * Math.PI * 1760 * t) + Math.sin(2 * Math.PI * 2637 * t)) *
      0.015 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.06 * t));
  }
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const fade = env(t, len, 3, 4);
    out[i] = (out[i] + sh[i]) * fade;
  }
  write("bed.wav", out, 0.55);
}

// ---- 2. Coin ding: FM bell ----
function ding() {
  const len = 1.6;
  const d = buf(len);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const decay = Math.exp(-3.2 * t);
    const mod = Math.sin(2 * Math.PI * 880 * t) * 4 * Math.exp(-4 * t);
    const carrier = Math.sin(2 * Math.PI * 1174.66 * t + mod);
    const carrier2 = Math.sin(2 * Math.PI * 1760 * t + mod) * 0.5;
    d[i] = (carrier + carrier2) * decay;
  }
  write("ding.wav", d, 0.75);
}

// ---- 3. Whoosh: bandpassed noise swell ----
function whoosh() {
  const len = 0.75;
  const d = buf(len);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const swell = Math.sin(Math.PI * (t / len)); // 0..1..0
    d[i] = rnd() * swell;
  }
  let out = lowpass(d, 1600);
  // subtract more lowpass for a band feel
  const low = lowpass(out, 300);
  for (let i = 0; i < out.length; i++) out[i] = out[i] - low[i] * 0.7;
  write("whoosh.wav", out, 0.5);
}

// ---- 4. Tick: teletype click ----
function tick() {
  const len = 0.045;
  const d = buf(len);
  let seed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    d[i] = (rnd() * 0.6 + Math.sin(2 * Math.PI * 2200 * t)) * Math.exp(-90 * t);
  }
  write("tick.wav", d, 0.4);
}

// ---- 5. Pop: badge snap (pitched pluck) ----
function pop() {
  const len = 0.28;
  const d = buf(len);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 420 + 900 * Math.exp(-30 * t);
    d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-14 * t);
  }
  write("pop.wav", d, 0.55);
}

// ---- 6. Chime: settle triad bell ----
function chime() {
  const len = 2.4;
  const d = buf(len);
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let n = 0; n < notes.length; n++) {
      const delay = n * 0.05;
      if (t < delay) continue;
      const tt = t - delay;
      s += Math.sin(2 * Math.PI * notes[n] * tt) * Math.exp(-2.4 * tt) * (1 - n * 0.15);
    }
    d[i] = s;
  }
  write("chime.wav", d, 0.6);
}

// ---- 7. Boom: sub impact ----
function boom() {
  const len = 1.1;
  const d = buf(len);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 90 * Math.exp(-8 * t) + 42;
    const click = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-60 * t) * 0.3;
    d[i] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-3.5 * t)) + click;
  }
  write("boom.wav", d, 0.85);
}

// ---- 8. Resolve chord: warm pad hit for the close ----
function chord() {
  const len = 4.0;
  const d = buf(len);
  const notes = [110, 164.81, 220, 277.18, 329.63]; // A C#-ish major-ish
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const f of notes) {
      s += Math.sin(2 * Math.PI * f * t) * 0.14;
      s += Math.sin(2 * Math.PI * f * 2 * t) * 0.03;
    }
    const e = env(t, len, 0.02, 2.5);
    d[i] = s * e;
  }
  let out = lowpass(d, 1400);
  write("chord.wav", out, 0.6);
}

ambient();
ding();
whoosh();
tick();
pop();
chime();
boom();
chord();
console.log("done");
