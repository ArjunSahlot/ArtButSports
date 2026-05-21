"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDrop } from "@/components/ImageDrop";
import { Weights } from "@/components/Weights";
import { absoluteImageUrl, defaultWeights, queryArt, type WeightPayload } from "@/lib/api";

type Result = {
  id: string;
  image_url: string;
  title?: string;
  creators?: string;
  accession_number?: string;
  scores: Record<string, number | null>;
};

export default function QueryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [weights, setWeights] = useState<WeightPayload>(defaultWeights);
  const [items, setItems] = useState<Result[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (nextOffset: number, replace = false) => {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await queryArt(file, weights, nextOffset, 28);
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
      setOffset(data.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [file, weights, loading]);

  useEffect(() => {
    if (file) load(0, true);
  }, [file, weights]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && file && !loading) load(offset);
    }, { rootMargin: "800px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [file, loading, offset, load]);

  return (
    <main className="mx-auto max-w-7xl px-5 py-14">
      <section className="mx-auto max-w-4xl text-center">
        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">Art But Sports</h1>
        <p className="mt-5 text-lg text-zinc-400">Inspired by artbutmakeitsports</p>
      </section>
      <section className="mx-auto mt-12 max-w-5xl space-y-5">
        <ImageDrop onFile={setFile} />
        <Weights value={weights} onChange={setWeights} />
      </section>
      {error && <p className="mt-8 rounded-md border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">{error}</p>}
      <section className="masonry mt-12">
        {items.map((item) => (
          <article key={`${item.id}-${item.scores.total}`} className="masonry-item group overflow-hidden rounded-lg border border-line bg-panel">
            <img src={absoluteImageUrl(item.image_url)} alt={item.title ?? "Artwork"} className="w-full object-cover opacity-95 transition group-hover:opacity-75" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">{item.title}</h2>
                  <p className="mt-1 text-xs text-zinc-400">{item.creators}</p>
                </div>
                <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-black">{item.scores.total?.toFixed(2)}</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-zinc-400">
                {["embeddings", "composition", "color", "pose"].map((name) => (
                  <span key={name}>{name.slice(0, 4)} {item.scores[name] == null ? "off" : Number(item.scores[name]).toFixed(2)}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
      {loading && <div className="mt-10 h-24 animate-pulse rounded-lg border border-line bg-panel" />}
      <div ref={sentinel} className="h-12" />
    </main>
  );
}

