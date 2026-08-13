// Talos demo — design tokens. Hermes (dark/electric) × Talos (amber/terminal).
export const C = {
  bg: "#0a0c0b",
  bg2: "#0e1210",
  panel: "rgba(20,26,24,0.72)",
  panelSolid: "#121715",
  line: "rgba(120,150,140,0.16)",
  lineStrong: "rgba(140,180,165,0.30)",
  text: "#e9f0ec",
  textDim: "#8fa39b",
  textFaint: "#5c6d66",
  cyan: "#35e0ff",
  cyanDim: "#1c7f92",
  amber: "#e9b949",
  bronze: "#c8933a",
  green: "#35d07f",
  greenGlow: "rgba(53,208,127,0.35)",
  red: "#ff5c5c",
  redGlow: "rgba(255,92,92,0.32)",
};

export const FONT = {
  head: "TalosHead, 'Space Grotesk', system-ui, sans-serif",
  mono: "TalosMono, 'JetBrains Mono', ui-monospace, monospace",
};

// scene boundaries in frames @30fps
export const SCENES = {
  open: [0, 180],
  stakes: [180, 390],
  registry: [390, 660],
  attest: [660, 900],
  settle: [900, 1350],
  autonomous: [1350, 1560],
  close: [1560, 1800],
} as const;

export const DUR = 1800;
export const FPS = 30;
