"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github } from "lucide-react";
import { Wordmark } from "./Logo";

const links = [
  { href: "/query", label: "Query" },
  { href: "/visualize", label: "Visualize" }
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/78 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/query" aria-label="ArtButSports home" className="transition-opacity hover:opacity-80">
          <Wordmark />
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 sm:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-lg border px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-neonTeal/40 bg-neonTeal/10 text-fg shadow-[0_0_18px_rgba(25,215,193,0.16)]"
                    : "border-transparent text-fg-muted hover:border-line hover:text-fg"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-neonTeal to-transparent" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 sm:hidden">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-2.5 py-1.5 text-sm ${
                    active ? "text-fg" : "text-fg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <a
            href="https://github.com/ArjunSahlot/ArtButSports"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-fg-muted transition-all hover:border-neonPurple/60 hover:text-fg hover:shadow-[0_0_20px_rgba(165,73,255,0.22)]"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}
