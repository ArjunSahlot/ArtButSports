"use client";

import { AlertTriangle, Loader2, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDrop } from "@/components/ImageDrop";
import { ResultCard } from "@/components/ResultCard";
import { Weights } from "@/components/Weights";
import { defaultWeights, queryArt, type ArtResult, type WeightPayload } from "@/lib/api";

const PAGE_SIZE = 28;

export default function QueryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [weights, setWeights] = useState<WeightPayload>(defaultWeights);
  const [items, setItems] = useState<ArtResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (nextOffset: number, replace: boolean) => {
      if (!file) return;
      const id = ++reqId.current;
      if (replace) setLoading(true);
      else setPaging(true);
      setError(null);
      try {
        const data = await queryArt(file, weights, nextOffset, PAGE_SIZE);
        if (id !== reqId.current) return;
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setOffset(data.next_offset);
        setTotal(data.total);
      } catch (err) {
        if (id !== reqId.current) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setPaging(false);
        }
      }
    },
    [file, weights]
  );

  // New file → query immediately.
  useEffect(() => {
    if (file) load(0, true);
    else {
      setItems([]);
      setOffset(0);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Weight changes → debounced re-query.
  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => load(0, true), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  // Infinite scroll.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          file &&
          !loading &&
          !paging &&
          !error &&
          items.length > 0 &&
          items.length < total
        ) {
          load(offset, false);
        }
      },
      { rootMargin: "900px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [file, loading, paging, error, offset, total, items.length, load]);

  const hasResults = items.length > 0;
  const exhausted = hasResults && items.length >= total && !paging;

  return (
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-fg-muted">
          <Sparkles size={12} className="text-accent" />
          Visual search across the Cleveland Museum of Art
        </span>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-6xl">
          Find the artwork hiding{" "}
          <span className="bg-gradient-to-r from-accent-bright to-accent bg-clip-text text-transparent">
            inside any image
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-fg-muted sm:text-base">
          Drop in a photograph — a sports moment, a snapshot, anything — and ArtButSports surfaces
          centuries-old works that echo its composition, color, and form.
        </p>
      </section>

      {/* Controls */}
      <section className="mx-auto mt-10 max-w-5xl space-y-3">
        <ImageDrop file={file} onFile={setFile} onClear={() => setFile(null)} />
        <Weights value={weights} onChange={setWeights} />
      </section>

      {/* Error */}
      {error && (
        <div className="mx-auto mt-8 flex max-w-5xl items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-sm font-medium text-fg">We couldn&apos;t complete that search</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">{error}</p>
          </div>
          {file && (
            <button
              type="button"
              onClick={() => load(0, true)}
              className="shrink-0 rounded-lg border border-danger/40 px-3 py-1.5 text-[13px] text-fg transition-colors hover:bg-danger/15"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* States */}
      {!file && !error && <HowItWorks />}

      {file && loading && <SkeletonGrid />}

      {file && !loading && hasResults && (
        <>
          <div className="mx-auto mt-12 mb-5 flex max-w-7xl items-center justify-between">
            <p className="text-[13px] text-fg-muted">
              <span className="font-medium text-fg">{total.toLocaleString()}</span> works ranked ·
              showing top {items.length}
            </p>
          </div>
          <section className="masonry">
            {items.map((item, index) => (
              <ResultCard key={`${item.id}-${index}`} item={item} index={index} />
            ))}
          </section>
          {paging && (
            <div className="mt-8 flex items-center justify-center gap-2 text-[13px] text-fg-muted">
              <Loader2 size={15} className="animate-spin-slow" />
              Loading more
            </div>
          )}
          {exhausted && (
            <p className="mt-10 text-center text-[13px] text-fg-dim">
              That&apos;s every match — you&apos;ve reached the end of the collection.
            </p>
          )}
        </>
      )}

      {file && !loading && !hasResults && !error && (
        <div className="mx-auto mt-16 max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-panel text-fg-dim">
            <Search size={20} />
          </div>
          <p className="mt-4 text-sm font-medium text-fg">No matches came back</p>
          <p className="mt-1 text-[13px] text-fg-muted">
            Try a different image or re-enable a signal you switched off.
          </p>
        </div>
      )}

      <div ref={sentinel} className="h-10" />
    </main>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Upload anything",
      copy: "A photo, a meme, a screenshot. It's analyzed in memory and never stored."
    },
    {
      n: "02",
      title: "Four signals score it",
      copy: "Semantics, composition, color, and human pose each rank the collection."
    },
    {
      n: "03",
      title: "Tune & explore",
      copy: "Reweight any signal live and watch the matches re-rank instantly."
    }
  ];
  return (
    <section className="mx-auto mt-16 grid max-w-5xl gap-3 sm:grid-cols-3">
      {steps.map((step) => (
        <div key={step.n} className="rounded-xl border border-line bg-panel p-5">
          <span className="font-mono text-[12px] text-accent">{step.n}</span>
          <h3 className="mt-2 text-[15px] font-medium text-fg">{step.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{step.copy}</p>
        </div>
      ))}
    </section>
  );
}

function SkeletonGrid() {
  const heights = [320, 240, 380, 280, 340, 260, 300, 360, 230, 320, 270, 350];
  return (
    <section className="masonry mt-12">
      {heights.map((h, i) => (
        <div key={i} className="masonry-item">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div
              className="animate-pulse bg-elevated"
              style={{ height: h }}
            />
            <div className="space-y-2 p-3.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-elevated" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-elevated" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
