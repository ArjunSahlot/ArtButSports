"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ImageOff, X } from "lucide-react";
import { useState } from "react";
import { absoluteImageUrl, type ArtResult } from "@/lib/api";

const SOURCES = ["embeddings", "composition", "color", "pose"] as const;
const SOURCE_LABEL: Record<string, string> = {
  embeddings: "Semantics",
  composition: "Composition",
  color: "Color",
  pose: "Pose"
};
const SOURCE_COLOR: Record<string, string> = {
  embeddings: "#1697ff",
  composition: "#19d7c1",
  color: "#ff8a00",
  pose: "#a549ff"
};
const DETAIL_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Composition", keys: ["saliency", "edges"] },
  { title: "Color", keys: ["lab", "palette", "warmcool", "contrast"] }
];

function scoreTone(value: number) {
  if (value >= 0.75) return "text-neonTeal";
  if (value >= 0.5) return "text-fg";
  return "text-fg-muted";
}

export function ResultCard({ item, index }: { item: ArtResult; index: number }) {
  const [broken, setBroken] = useState(false);
  const src = absoluteImageUrl(item.image_url);
  const total = item.scores.total ?? 0;

  return (
    <Dialog.Root>
      <article
        className="masonry-item animate-fade-up"
        style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
      >
        <Dialog.Trigger className="group block w-full overflow-hidden rounded-xl border border-line bg-panel text-left transition-all duration-200 hover:border-neonTeal/50 hover:shadow-glow">
          <div className="relative overflow-hidden bg-elevated">
            {broken ? (
              <div className="flex aspect-[4/5] items-center justify-center text-fg-dim">
                <ImageOff size={26} />
              </div>
            ) : (
              <img
                src={src}
                alt={item.title ?? "Artwork"}
                loading="lazy"
                onError={() => setBroken(true)}
                className="w-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute right-2.5 top-2.5 rounded-md border border-neonTeal/30 bg-ink/85 px-2 py-1 font-mono text-[12px] font-semibold tabular-nums text-neonTeal backdrop-blur">
              {total.toFixed(3)}
            </div>
          </div>
          <div className="p-3.5">
            <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-fg">
              {item.title || "Untitled"}
            </h3>
            <p className="mt-1 line-clamp-1 text-[12px] text-fg-muted">
              {item.creators || "Unknown maker"}
            </p>
            <div className="mt-3 space-y-1.5">
              {SOURCES.map((key) => {
                const raw = item.scores[key];
                const off = raw == null;
                const value = off ? 0 : (raw as number);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-[68px] shrink-0 text-[10px] uppercase tracking-wide text-fg-dim">
                      {SOURCE_LABEL[key]}
                    </span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-elevated">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
                          background: `linear-gradient(90deg, ${SOURCE_COLOR[key]}99, ${SOURCE_COLOR[key]})`
                        }}
                      />
                    </span>
                    <span
                      className={`w-8 shrink-0 text-right font-mono text-[10px] tabular-nums ${
                        off ? "text-fg-dim" : "text-fg-muted"
                      }`}
                    >
                      {off ? "—" : value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Dialog.Trigger>
      </article>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/85 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(940px,94vw)] -translate-x-1/2 -translate-y-1/2 animate-scale-in overflow-auto rounded-xl2 border border-neonTeal/30 bg-panel shadow-glow">
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-ink/80 text-fg-muted backdrop-blur transition-colors hover:text-fg"
          >
            <X size={16} />
          </Dialog.Close>
          <div className="grid md:grid-cols-[1.15fr_1fr]">
            <div className="flex items-center justify-center bg-ink/60 p-4 md:p-6">
              {broken ? (
                <div className="flex aspect-square w-full items-center justify-center text-fg-dim">
                  <ImageOff size={32} />
                </div>
              ) : (
                <img
                  src={src}
                  alt={item.title ?? "Artwork"}
                  className="max-h-[72vh] w-full rounded-lg object-contain"
                />
              )}
            </div>
            <div className="p-6">
              <Dialog.Title className="text-lg font-semibold leading-snug text-fg">
                {item.title || "Untitled"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-fg-muted">
                {item.creators || "Unknown maker"}
              </Dialog.Description>
              {item.accession_number && (
                <p className="mt-2 font-mono text-[11px] text-fg-dim">
                  Accession {item.accession_number}
                </p>
              )}

              <div className="mt-5 flex items-baseline gap-2 rounded-xl border border-line bg-elevated/60 px-4 py-3">
                <span className="font-mono text-2xl font-semibold tabular-nums text-neonTeal">
                  {total.toFixed(3)}
                </span>
                <span className="text-[12px] text-fg-muted">overall match score</span>
              </div>

              <div className="mt-5 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-dim">
                  Signals
                </p>
                {SOURCES.map((key) => (
                  <ScoreRow key={key} label={SOURCE_LABEL[key]} value={item.scores[key]} />
                ))}
              </div>

              {DETAIL_GROUPS.map((group) => (
                <div key={group.title} className="mt-5 space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-dim">
                    {group.title} detail
                  </p>
                  {group.keys.map((key) => (
                    <ScoreRow key={key} label={key} value={item.scores[key]} subtle />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScoreRow({
  label,
  value,
  subtle = false
}: {
  label: string;
  value: number | null | undefined;
  subtle?: boolean;
}) {
  const off = value == null;
  const v = off ? 0 : value;
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-[88px] shrink-0 text-[12px] capitalize ${
          subtle ? "text-fg-muted" : "text-fg"
        }`}
      >
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-neonBlue via-neonTeal to-neonPurple"
          style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }}
        />
      </span>
      <span
        className={`w-9 shrink-0 text-right font-mono text-[12px] tabular-nums ${
          off ? "text-fg-dim" : scoreTone(v)
        }`}
      >
        {off ? "off" : v.toFixed(2)}
      </span>
    </div>
  );
}
