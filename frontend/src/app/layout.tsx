import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ArtButSports — find the artwork inside any image",
  description:
    "Upload any photograph and surface visually resonant CC0 artworks from the Cleveland Museum of Art's open collection."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="backdrop" />
        <SiteNav />
        {children}
        <footer className="mt-24 border-t border-line/70">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-fg-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>
              Artworks are CC0 public-domain works from the{" "}
              <a
                href="https://www.clevelandart.org/open-access"
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
              >
                Cleveland Museum of Art
              </a>
              .
            </p>
            <p>
              Built by{" "}
              <a
                href="https://github.com/ArjunSahlot"
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
              >
                Arjun Sahlot
              </a>
              . Uploaded images are processed in memory and never stored.
            </p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
