import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "Talos", preference: "all" }),
    // WalletConnect only wired when a projectId is provided (else it throws on init).
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata: {
              name: "Talos Onboard",
              description: "Integrate Talos — the eval layer for the agent economy",
              url: "https://github.com/sairammr/Talos",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

export const HAS_WALLETCONNECT = Boolean(wcProjectId);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
