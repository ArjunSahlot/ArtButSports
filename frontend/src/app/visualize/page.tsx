"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowRight, Brain, Frame, ImagePlus, Palette, PersonStanding, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { visualizeStep } from "@/lib/api";
import { VISUALIZE_SAMPLES } from "@/lib/samples";

type Section = {
  step: string;
  index: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  color: string;
  border: string;
};

const sections: Section[] = [
  {
    step: "embeddings",
    index: "01",
    title: "Semantics",
    icon: Brain,
    copy: "Gemini encodes the image into a normalized vector that captures its broad visual meaning — the subject, mood, and scene as a whole.",
    color: "#1697ff",
    border: "border-neonBlue/40"
  },
  {
    step: "composition",
    index: "02",
    title: "Composition",
    icon: Frame,
    copy: "A MobileNet saliency map is reduced to a 16×16 grid, then paired with an edge-orientation histogram to describe how the frame is arranged.",
    color: "#19d7c1",
    border: "border-neonTeal/40"
  },
  {
    step: "color",
    index: "03",
    title: "Color",
    icon: Palette,
    copy: "LAB histograms, a quantized palette, warm/cool balance, and a contrast profile combine into a fixed descriptor of the image's color world.",
    color: "#ff8a00",
    border: "border-neonOrange/40"
  },
  {
    step: "pose",
    index: "04",
    title: "Pose",
    icon: PersonStanding,
    copy: "YOLO pose detections become joint-angle descriptors. Pose only contributes when both images contain a confidently detected person.",
    color: "#a549ff",
    border: "border-neonPurple/40"
  }
];

export default function VisualizePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
      <section className="max-w-3xl">
        <h1 className="text-balance text-3xl font-black tracking-tight text-fg sm:text-5xl">
          How ArtButSports sees an image
        </h1>
        <p className="mt-4 text-balance text-[15px] leading-relaxed text-fg-muted sm:text-base">
          Every match is the sum of four independent signals. Each one transforms your image into a
          comparable descriptor. Here&apos;s what that transformation looks like.
        </p>
      </section>

      <div className="mt-14 space-y-5">
        {sections.map((section) => (
          <VisualSection key={section.step} {...section} />
        ))}
      </div>
    </main>
  );
}

function VisualSection({ step, index, title, copy, icon: Icon, color, border }: Section) {
  const sample = VISUALIZE_SAMPLES[step];

  return (
    <section className={`grid gap-6 rounded-xl2 border bg-panel p-5 shadow-soft sm:p-7 md:grid-cols-[0.82fr_1.18fr] ${border}`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-ink text-fg"
            style={{ borderColor: color, boxShadow: `0 0 18px ${color}33` }}
          >
            <Icon size={17} />
          </div>
          <span className="font-mono text-[12px] text-fg-dim">{index}</span>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-fg">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{copy}</p>
        <div className="mt-auto pt-5">
          <TryModal step={step} title={title} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <VisualPanel src={sample?.before} label="Input" />
        <ArrowRight size={18} style={{ color }} />
        <VisualPanel src={sample?.after} label={title} />
      </div>
    </section>
  );
}

function VisualPanel({ src, label }: { src?: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-ink/70">
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-4 text-center text-[11px] text-fg-dim">
            <AlertTriangle size={16} />
            Sample unavailable
          </span>
        )}
      </div>
      <p className="text-center text-[11px] uppercase tracking-wide text-fg-dim">{label}</p>
    </div>
  );
}

function ModalPanel({
  src,
  label,
  loading = false
}: {
  src?: string | null;
  label: string;
  loading?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-ink/70">
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : loading ? (
          <div className="h-full w-full animate-pulse bg-elevated" />
        ) : (
          <span className="text-[12px] text-fg-dim">Waiting</span>
        )}
      </div>
      <p className="text-center text-[11px] uppercase tracking-wide text-fg-dim">{label}</p>
    </div>
  );
}

function TryModal({ step, title }: { step: string; title: string }) {
  const [before, setBefore] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [json, setJson] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setImage(null);
    setJson("");
    const preview = URL.createObjectURL(file);
    setBefore((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return preview;
    });
    try {
      const data = await visualizeStep(file, step);
      const first = data.images ? (Object.values(data.images)[0] as string) : null;
      setImage(first);
      setJson(JSON.stringify({ ...data, images: undefined }, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) {
          setBefore((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return null;
          });
          setImage(null);
          setJson("");
          setError(null);
        }
      }}
    >
      <Dialog.Trigger className="inline-flex items-center gap-2 rounded-lg border border-line bg-elevated px-3.5 py-2 text-[13px] font-medium text-fg transition-colors hover:border-neonTeal/50">
        <ImagePlus size={14} className="text-neonTeal" />
        Try it with your own image
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/85 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(860px,94vw)] -translate-x-1/2 -translate-y-1/2 animate-scale-in overflow-auto rounded-xl2 border border-neonTeal/30 bg-panel p-6 shadow-glow">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-fg">
                {title} — live transform
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-fg-muted">
                Upload an image to run the {title.toLowerCase()} step and inspect its raw output.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted transition-colors hover:text-fg"
            >
              <X size={14} />
            </Dialog.Close>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-elevated/50 py-4 text-[13px] text-fg-muted transition-colors hover:border-fg-dim hover:text-fg"
          >
            <ImagePlus size={15} />
            Choose an image
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => run(event.target.files?.[0])}
          />

          {busy && <div className="mt-5 h-48 animate-pulse rounded-lg bg-elevated" />}

          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-fg-muted">
              <AlertTriangle size={15} className="text-danger" />
              {error}
            </p>
          )}

          {(before || image) && (
            <div className="mt-5 grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <ModalPanel src={before} label="Before" />
              <ArrowRight size={18} className="mx-auto mt-[34%] hidden text-fg-dim sm:block" />
              <ModalPanel src={image} label="After" loading={busy} />
            </div>
          )}
          {json && (
            <pre className="mt-3 overflow-auto rounded-lg border border-line bg-ink/70 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
              {json}
            </pre>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
