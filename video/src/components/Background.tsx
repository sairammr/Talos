import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

// Static grain via inline SVG turbulence (deterministic, render-safe).
const grain =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>`,
  );

export const Background: React.FC<{ hue?: string }> = ({ hue = C.cyan }) => {
  const frame = useCurrentFrame();
  // very slow drifting glow
  const gx = 50 + 8 * Math.sin(frame * 0.006);
  const gy = 42 + 6 * Math.cos(frame * 0.008);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* radial ambient glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${gx}% ${gy}%, ${hue}14, transparent 60%), radial-gradient(900px 900px at 88% 90%, ${C.amber}0e, transparent 55%)`,
        }}
      />
      {/* faint grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(circle at 50% 45%, black 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 45%, black 30%, transparent 78%)",
          opacity: 0.5,
        }}
      />
      {/* scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px)",
          opacity: 0.35,
          mixBlendMode: "overlay",
        }}
      />
      {/* grain */}
      <AbsoluteFill
        style={{
          backgroundImage: `url(${grain})`,
          backgroundSize: "180px 180px",
          opacity: 0.06,
          mixBlendMode: "overlay",
        }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 400px 120px rgba(0,0,0,0.85)",
        }}
      />
    </AbsoluteFill>
  );
};

// intro flash used by scenes
export const useFadeIn = (start: number, dur = 12) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
