import { loadFont as loadHead } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// register under custom family names used in theme.ts
const head = loadHead("normal", { weights: ["500", "700"] });
const mono = loadMono("normal", { weights: ["400", "500", "700"] });

export const headFamily = head.fontFamily;
export const monoFamily = mono.fontFamily;
export const fontsReady = Promise.all([head.waitUntilDone(), mono.waitUntilDone()]);
