import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Talos — Integrate the eval layer",
  description:
    "Onboard to Talos: register a reproducible eval onchain, wire it into escrow settlement, and lock a live test deal on Base Sepolia.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="grid-bg min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
