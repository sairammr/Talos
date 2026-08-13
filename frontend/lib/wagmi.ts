import { http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";

// Privy manages the connectors — @privy-io/wagmi syncs the Privy-authenticated
// wallet (embedded or external) into wagmi, so all wagmi hooks keep working.
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
