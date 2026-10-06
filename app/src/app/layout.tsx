import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { X_URL } from "@/lib/links";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://stockodds.fun";
const tagline = "Say your odds on the next hour of NVIDIA, Alphabet and ETH. Get paid for being right with the right confidence.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "StockOdds",
  description: `${tagline} Hourly rounds on Robinhood Chain, settled from Uniswap prices, no house edge on losses. The fee burns $ODDS.`,
  openGraph: { title: "StockOdds", description: tagline, siteName: "StockOdds", type: "website" },
  twitter: { card: "summary_large_image", title: "StockOdds", description: tagline },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <footer className="footer">
            <span className="footer-links">
              {X_URL && (
                <a href={X_URL} target="_blank" rel="noreferrer">
                  X
                </a>
              )}
              <a href="/how">Rules</a>
              <a href="/safety">Safety</a>
            </span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
