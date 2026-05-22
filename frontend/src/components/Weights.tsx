"use client";

import { Brain, Frame, Palette, PersonStanding, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import { defaultWeights, type WeightPayload } from "@/lib/api";
import { Slider } from "./Slider";

type Source = {
  key: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  from: string;
  to: string;
  border: string;
};

const sources: Source[] = [
  { key: "embeddings", label: "Semantics", blurb: "Overall visual meaning", icon: Brain, from: "#1697ff", to: "#2da1ff", border: "border-neonBlue/45" },
  { key: "composition", label: "Composition", blurb: "Layout, saliency & edges", icon: Frame, from: "#19d7c1", to: "#36f0d8", border: "border-neonTeal/45" },
  { key: "color", label: "Color", blurb: "Palette, warmth & contrast", icon: Palette, from: "#ff8a00", to: "#ffb02e", border: "border-neonOrange/45" },
  { key: "pose", label: "Pose", blurb: "Human skeleton alignment", icon: PersonStanding, from: "#a549ff", to: "#c47cff", border: "border-neonPurple/45" }
];

const colorLabels = ["lab", "palette", "warmcool", "contrast"];
const compositionLabels = ["saliency", "edges"];

export function Weights({
  value,
  onChange
}: {
  value: WeightPayload;
  onChange: (next: WeightPayload) => void;
}) {
  function setSource(name: string, weight: number) {
    onChange({
      ...value,
      sources: { ...value.sources, [name]: weight },
      enabled: { ...value.enabled, [name]: true }
    });
  }
  function setNested(group: "color" | "composition", name: string, weight: number) {
    onChange({ ...value, [group]: { ...value[group], [name]: weight } });
  }

  const activeTotal = sources.reduce(
    (sum, s) => sum + value.sources[s.key],
    0
  );
  const isDefault = JSON.stringify(value) === JSON.stringify(defaultWeights);

  return (
    <div className="rounded-xl2 border border-line bg-panel/95 p-4 shadow-glow sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-fg">Tune the match</h2>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            Weight each signal to steer how matches are ranked.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(defaultWeights)}
            disabled={isDefault}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink/40 px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-neonOrange/50 hover:text-fg disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <GranularDialog value={value} setNested={setNested} />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {sources.map((source) => {
          const weight = value.sources[source.key];
          const share = activeTotal > 0 ? (weight / activeTotal) * 100 : 0;
          const Icon = source.icon;
          return (
            <div
              key={source.key}
              className={`rounded-xl border bg-elevated/60 p-3.5 transition-colors ${source.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg border bg-ink text-fg transition-colors"
                    style={{ borderColor: source.from, boxShadow: `0 0 18px ${source.from}33` }}
                  >
                    <Icon size={15} />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-fg">{source.label}</p>
                    <p className="text-[11px] text-fg-muted">{source.blurb}</p>
                  </div>
                </div>
                <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[11px] text-fg-muted">
                  {weight <= 0 ? "0%" : `${share.toFixed(0)}%`}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Slider
                  value={weight}
                  onChange={(n) => setSource(source.key, n)}
                  aria-label={`${source.label} weight`}
                  from={source.from}
                  to={source.to}
                />
                <span className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums text-fg">
                  {weight.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GranularDialog({
  value,
  setNested
}: {
  value: WeightPayload;
  setNested: (group: "color" | "composition", name: string, weight: number) => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink/40 px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-neonPurple/50 hover:text-fg">
        <SlidersHorizontal size={13} /> Advanced
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-xl2 border border-neonTeal/30 bg-panel p-6 shadow-glow">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-fg">
                Advanced weights
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-fg-muted">
                Fine-tune the sub-signals inside Composition and Color.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted transition-colors hover:text-fg"
            >
              <X size={14} />
            </Dialog.Close>
          </div>
          <div className="mt-6 grid gap-7 sm:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-dim">
                Composition
              </h3>
              {compositionLabels.map((name) => (
                <LabeledSlider
                  key={name}
                  label={name}
                  value={value.composition[name]}
                  onChange={(n) => setNested("composition", name, n)}
                />
              ))}
            </div>
            <div className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-dim">
                Color
              </h3>
              {colorLabels.map((name) => (
                <LabeledSlider
                  key={name}
                  label={name}
                  value={value.color[name]}
                  onChange={(n) => setNested("color", name, n)}
                />
              ))}
            </div>
          </div>
          <p className="mt-6 border-t border-line pt-4 text-[12px] text-fg-muted">
            Pose contributes only when both the query and a candidate contain a confidently
            detected person.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LabeledSlider({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="capitalize text-fg">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-fg-muted">{value.toFixed(2)}</span>
      </div>
      <Slider value={value} onChange={onChange} aria-label={label} />
    </div>
  );
}
