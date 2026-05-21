"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { visualizeStep } from "@/lib/api";

const sections = [
  { step: "embeddings", title: "Embeddings", copy: "Gemini maps the image into a normalized semantic vector for broad visual meaning." },
  { step: "composition", title: "Composition", copy: "MobileNet saliency is reduced to a 16 by 16 grid, then paired with an edge-orientation histogram." },
  { step: "color", title: "Color", copy: "LAB histograms, a quantized palette, warm/cool balance, and contrast profile become fixed vectors." },
  { step: "pose", title: "Pose", copy: "YOLO pose detections become joint-angle descriptors; pose contributes only when both sides contain a person." }
];

export default function VisualizePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">Visualize how ArtButSports comes up with its closest matches.</h1>
      <div className="mt-14 space-y-14">
        {sections.map((section) => <VisualSection key={section.step} {...section} />)}
      </div>
    </main>
  );
}

function VisualSection({ step, title, copy }: { step: string; title: string; copy: string }) {
  return (
    <section className="grid gap-8 border-t border-line pt-10 md:grid-cols-[0.8fr_1.2fr]">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-zinc-400">{copy}</p>
        <TryModal step={step} title={title} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="aspect-[4/3] rounded-lg border border-line bg-[radial-gradient(circle_at_35%_20%,rgba(55,255,180,0.18),transparent_35%),#0d0d10]" />
        <span className="text-zinc-500">→</span>
        <div className="aspect-[4/3] rounded-lg border border-line bg-[radial-gradient(circle_at_65%_35%,rgba(255,71,120,0.20),transparent_36%),#0d0d10]" />
      </div>
    </section>
  );
}

function TryModal({ step, title }: { step: string; title: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [json, setJson] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = await visualizeStep(file, step);
      const first = data.images ? Object.values(data.images)[0] as string : null;
      setImage(first);
      setJson(JSON.stringify({ ...data, images: undefined }, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root>
      <Dialog.Trigger className="mt-5 inline-flex items-center gap-2 text-sm text-white underline decoration-zinc-600 underline-offset-4">
        Try it with your own <ArrowUpRight size={14} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(760px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-line bg-panel p-6">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <input className="mt-5 w-full rounded-md border border-line bg-black p-3 text-sm" type="file" accept="image/*" onChange={(event) => run(event.target.files?.[0])} />
          {busy && <div className="mt-5 h-48 animate-pulse rounded-lg bg-black" />}
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {image && <img src={image} alt={`${title} output`} className="mt-5 max-h-[460px] w-full rounded-md object-contain" />}
          {json && <pre className="mt-4 overflow-auto rounded-md bg-black p-4 text-xs text-zinc-300">{json}</pre>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

