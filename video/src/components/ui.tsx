import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from "remotion";
import { C } from "../theme";
import { headFamily, monoFamily } from "../fonts";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({
  children,
  color = C.cyan,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [delay, delay + 16], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return (
    <div
      style={{
        fontFamily: monoFamily,
        fontSize: 22,
        letterSpacing: 6,
        textTransform: "uppercase",
        color,
        opacity: o,
        transform: `translateY(${y}px)`,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ width: 34, height: 2, background: color, boxShadow: `0 0 12px ${color}` }} />
      {children}
    </div>
  );
};

export const Heading: React.FC<{ children: React.ReactNode; size?: number; delay?: number; color?: string }> = ({
  children,
  size = 92,
  delay = 0,
  color = C.text,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  const o = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: headFamily,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: -1.5,
        color,
        opacity: o,
        transform: `translateY(${(1 - s) * 26}px)`,
      }}
    >
      {children}
    </div>
  );
};

// Teletype reveal — chars appear on a per-char cadence, blinking cursor.
export const Teletype: React.FC<{
  text: string;
  delay?: number;
  cps?: number; // chars per second
  size?: number;
  color?: string;
  mono?: boolean;
  cursor?: boolean;
}> = ({ text, delay = 0, cps = 42, size = 30, color = C.text, mono = true, cursor = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);
  const chars = Math.floor((local / fps) * cps);
  const shown = text.slice(0, chars);
  const done = chars >= text.length;
  const blink = Math.floor(frame / 14) % 2 === 0;
  return (
    <span style={{ fontFamily: mono ? monoFamily : headFamily, fontSize: size, color, letterSpacing: mono ? 0.5 : 0 }}>
      {shown}
      {cursor && (!done || blink) && (
        <span style={{ color: C.cyan, opacity: done ? (blink ? 1 : 0) : 1 }}>▋</span>
      )}
    </span>
  );
};

export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; delay?: number; glow?: string }> = ({
  children,
  style,
  delay = 0,
  glow,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 } });
  const o = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        backdropFilter: "blur(6px)",
        boxShadow: `0 24px 80px rgba(0,0,0,0.5)${glow ? `, 0 0 60px ${glow}` : ""}`,
        opacity: o,
        transform: `translateY(${(1 - s) * 22}px) scale(${0.98 + s * 0.02})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Chip: React.FC<{ name: string; bar: string; kind: string; delay?: number; accent?: string }> = ({
  name,
  bar,
  kind,
  delay = 0,
  accent = C.amber,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6, stiffness: 120 } });
  const o = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 26px",
        borderRadius: 999,
        border: `1px solid ${C.lineStrong}`,
        background: "rgba(18,23,21,0.8)",
        opacity: o,
        transform: `scale(${0.7 + s * 0.3})`,
        boxShadow: `0 0 0 1px rgba(0,0,0,0.3), 0 10px 40px rgba(0,0,0,0.4)`,
      }}
    >
      <span style={{ fontFamily: headFamily, fontWeight: 700, fontSize: 30, color: C.text }}>{name}</span>
      <span style={{ fontFamily: monoFamily, fontSize: 24, color: accent }}>{bar}</span>
      <span style={{ fontFamily: monoFamily, fontSize: 17, letterSpacing: 2, color: C.textFaint }}>{kind}</span>
    </div>
  );
};

export const Badge: React.FC<{ label: string; color: string; delay?: number }> = ({ label, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 10, mass: 0.5, stiffness: 140 } });
  return (
    <span
      style={{
        fontFamily: monoFamily,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 2,
        color,
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "6px 12px",
        background: `${color}18`,
        opacity: interpolate(s, [0, 1], [0, 1]),
        transform: `scale(${0.4 + s * 0.6})`,
        display: "inline-block",
        boxShadow: `0 0 20px ${color}55`,
      }}
    >
      {label}
    </span>
  );
};

// Score meter with threshold marker. fills to `score`% by `fillDur`.
export const Meter: React.FC<{
  score: number;
  threshold: number;
  pass: boolean;
  delay?: number;
  width?: number;
}> = ({ score, threshold, pass, delay = 0, width = 360 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 26], [0, score], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const col = pass ? C.green : C.red;
  return (
    <div style={{ width, position: "relative" }}>
      <div style={{ height: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", overflow: "hidden", border: `1px solid ${C.line}` }}>
        <div
          style={{
            width: `${p}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${col}aa, ${col})`,
            boxShadow: `0 0 16px ${col}`,
          }}
        />
      </div>
      {/* threshold marker */}
      <div
        style={{
          position: "absolute",
          top: -6,
          left: `${threshold}%`,
          width: 2,
          height: 24,
          background: C.textDim,
        }}
      />
      <div style={{ position: "absolute", top: -26, left: `calc(${threshold}% - 10px)`, fontFamily: monoFamily, fontSize: 13, color: C.textFaint }}>
        thr
      </div>
    </div>
  );
};

export { headFamily, monoFamily };
