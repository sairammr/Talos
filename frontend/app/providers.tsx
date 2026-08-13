"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseSepolia } from "viem/chains";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";

const APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmsra3o9g01ow0dl02pvapz18";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        // Give newcomers a wallet automatically — anyone can transact.
        // showWalletUIs:false → embedded wallet signs without a per-tx popup (smooth demo).
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        loginMethods: ["wallet", "email", "google"],
        appearance: {
          theme: "light",
          accentColor: "#3366cc",
          logo: undefined,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
