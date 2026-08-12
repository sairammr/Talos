// Tiny colored logger so the demo reads well on camera.
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function ts() {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  buyer: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.cyan}BUYER  ${C.reset} ${m}`),
  seller: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.magenta}SELLER ${C.reset} ${m}`),
  critic: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.yellow}CRITIC ${C.reset} ${m}`),
  keeper: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.blue}KEEPER ${C.reset} ${m}`),
  hub: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.green}KEEPRHB${C.reset} ${m}`),
  chain: (m: string) => console.log(`${C.dim}${ts()}${C.reset} ${C.bold}CHAIN  ${C.reset} ${m}`),
  ok: (m: string) => console.log(`${C.green}  ✓ ${m}${C.reset}`),
  bad: (m: string) => console.log(`${C.red}  ✗ ${m}${C.reset}`),
  info: (m: string) => console.log(`${C.dim}   ${m}${C.reset}`),
  banner: (m: string) => console.log(`\n${C.bold}${C.blue}━━ ${m} ━━${C.reset}`),
};

export const color = C;
