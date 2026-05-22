"use client";

import { AlertTriangle, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDrop } from "@/components/ImageDrop";
import { ResultCard } from "@/components/ResultCard";
import { Weights } from "@/components/Weights";
import { useMasonrySpan } from "@/components/useMasonrySpan";
import {
  defaultWeights,
  queryArt,
  queryDemo,
  type ArtResult,
  type WeightPayload
} from "@/lib/api";
import { DEMO_IMAGES, type DemoImage } from "@/lib/samples";

const PAGE_SIZE = 28;

export default function QueryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedDemo, setSelectedDemo] = useState<DemoImage | null>(null);
  const [weights, setWeights] = useState<WeightPayload>(defaultWeights);
  const [items, setItems] = useState<ArtResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
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
        const data = selectedDemo
          ? await queryDemo(selectedDemo.filename, weights, nextOffset, PAGE_SIZE)
          : await queryArt(file, weights, nextOffset, PAGE_SIZE);
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
    [file, selectedDemo, weights]
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
  }, [file, selectedDemo]);

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

  async function chooseDemo(demo: DemoImage) {
    setDemoLoading(demo.filename);
    setError(null);
    setSelectedDemo(demo);
    setFile(new File(["demo"], demo.filename, { type: "image/png" }));
    setDemoLoading(null);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      {/* Hero */}
      <section className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-black tracking-tight text-fg sm:text-6xl">
            Art But Sports
          </h1>
          <p className="mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-fg-muted sm:text-base">
            Drop in a sports frame or pick a demo. ArtButSports compares semantics, composition,
            color, and pose against public-domain artworks.
          </p>
          <p className="mt-2 max-w-xl text-[13px] text-fg-dim">
            Inspired by{" "}
            <a
              href="https://www.instagram.com/artbutmakeitsports/"
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
            >
              @artbutmakeitsports
            </a>{" "}
            on Instagram.
          </p>
        </div>
      </section>

      {/* Controls */}
      <section className="mx-auto mt-10 max-w-5xl space-y-3">
        <ImageDrop
          file={selectedDemo ? null : file}
          previewUrl={selectedDemo ? selectedDemo.url : null}
          previewName={selectedDemo?.name}
          onFile={(next) => {
            setSelectedDemo(null);
            setFile(next);
          }}
          onClear={() => {
            setSelectedDemo(null);
            setFile(null);
          }}
        />
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
      {!file && !error && (
        <DemoGallery demos={DEMO_IMAGES} loading={demoLoading} onPick={chooseDemo} />
      )}

      {file && loading && <QueryLoading />}

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

function DemoGallery({
  demos,
  loading,
  onPick
}: {
  demos: DemoImage[];
  loading: string | null;
  onPick: (demo: DemoImage) => void;
}) {
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-fg">Demo starting lines</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Pick one of these ready-made sports references, or upload your own above.
          </p>
        </div>
      </div>
      <div className="masonry">
        {demos.map((demo) => (
          <DemoCard
            key={demo.filename}
            demo={demo}
            loading={loading === demo.filename}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

function DemoCard({
  demo,
  loading,
  onPick
}: {
  demo: DemoImage;
  loading: boolean;
  onPick: (demo: DemoImage) => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  useMasonrySpan(cardRef);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onPick(demo)}
      className="masonry-item group w-full overflow-hidden rounded-xl border border-line bg-panel text-left transition-all hover:-translate-y-0.5 hover:border-neonTeal/50 hover:shadow-glow"
    >
      <div className="relative">
        <img
          src={demo.url}
          alt={demo.name}
          className="w-full object-cover transition duration-300 group-hover:scale-[1.025]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent opacity-90" />
        <div className="absolute left-3 top-3 h-8 w-8 rounded-full border border-neonOrange/60 bg-neonOrange/15 shadow-[0_0_18px_rgba(255,138,0,0.22)]" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
            <Loader2 size={20} className="animate-spin-slow text-accent" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-3.5">
        <span className="text-[13px] font-medium text-fg">{demo.name}</span>
        <span className="rounded-md border border-neonBlue/40 bg-neonBlue/10 px-2 py-1 text-[11px] text-fg-muted">Analyze</span>
      </div>
    </button>
  );
}

function QueryLoading() {
  const steps = [
    "Embedding query image",
    "Reading composition",
    "Extracting color",
    "Checking pose",
    "Ranking the collection"
  ];
  const [active, setActive] = useState(0);
  const pct = Math.min(96, 12 + active * 20);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => Math.min(steps.length - 1, current + 1));
    }, 850);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <section className="mx-auto mt-12 max-w-3xl rounded-xl2 border border-neonTeal/35 bg-panel p-6 shadow-glow">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neonTeal/50 bg-neonTeal/10 text-neonTeal">
          <Loader2 size={19} className="animate-spin-slow" />
        </div>
        <div>
          <p className="text-sm font-semibold text-fg">Searching the collection</p>
          <p className="mt-0.5 text-[13px] text-fg-muted">{steps[active]}</p>
        </div>
        <span className="ml-auto font-mono text-[12px] text-fg-muted">{pct}%</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-gradient-to-r from-neonBlue via-neonTeal to-neonPurple transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`rounded-lg border px-2.5 py-2 text-[11px] ${
              index <= active
                ? "border-neonTeal/45 bg-neonTeal/10 text-fg"
                : "border-line bg-elevated/40 text-fg-dim"
            }`}
          >
            {step}
          </div>
        ))}
      </div>
    </section>
  );
}
