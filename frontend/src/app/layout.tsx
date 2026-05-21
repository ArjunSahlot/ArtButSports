import type { Metadata } from "next";
import Link from "next/link";
import { Github, Moon } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArtButSports",
  description: "Find visually similar CC0 artworks."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="sticky top-0 z-40 border-b border-line/80 bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
            <Link href="/query" className="text-sm font-semibold tracking-wide">
              ArtButSports
            </Link>
            <div className="flex gap-6 text-sm text-zinc-300">
              <Link href="/query" className="hover:text-white">Query</Link>
              <Link href="/visualize" className="hover:text-white">Visualize</Link>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <button className="rounded-md border border-line p-2" aria-label="Theme">
                <Moon size={16} />
              </button>
              <a className="rounded-md border border-line p-2" href="https://github.com/ArjunSahlot/ArtButSports" aria-label="GitHub">
                <Github size={16} />
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}

