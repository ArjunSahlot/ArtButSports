"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Brain, Frame, Palette, PersonStanding, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { defaultWeights, type WeightPayload } from "@/lib/api";
import { Slider } from "./Slider";
import { Toggle } from "./Toggle";

type Source = {
  key: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
};

const sources: Source[] = [
  { key: "embeddings", label: "Semantics", blurb: "Overall visual meaning", icon: Brain },
  { key: "composition", label: "Composition", blurb: "Layout, saliency & edges", icon: Frame },
  { key: "color", label: "Color", blurb: "Palette, warmth & contrast", icon: Palette },
  { key: "pose", label: "Pose", blurb: "Human skeleton alignment", icon: PersonStanding }
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
    onChange({ ...value, sources: { ...value.sources, [name]: weight } });
  }
  function setEnabled(name: string, enabled: boolean) {
    onChange({ ...value, enabled: { ...value.enabled, [name]: enabled } });
  }
  function setNested(group: "color" | "composition", name: string, weight: number) {
    onChange({ ...value, [group]: { ...value[group], [name]: weight } });
  }

  const activeTotal = sources.reduce(
    (sum, s) => sum + (value.enabled[s.key] ? value.sources[s.key] : 0),
    0
  );
  const isDefault = JSON.stringify(value) === JSON.stringify(defaultWeights);

  return (
    <div className="rounded-xl2 border border-line bg-panel p-4 sm:p-5">
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <GranularDialog value={value} setNested={setNested} />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {sources.map((source) => {
          const enabled = value.enabled[source.key];
          const weight = value.sources[source.key];
          const share = enabled && activeTotal > 0 ? (weight / activeTotal) * 100 : 0;
          const Icon = source.icon;
          return (
            <div
              key={source.key}
              className={`rounded-xl border p-3.5 transition-colors ${
                enabled ? "border-line bg-elevated/60" : "border-line/60 bg-panel"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                      enabled
                        ? "border-accent-deep/50 bg-accent/10 text-accent"
                        : "border-line text-fg-dim"
                    }`}
                  >
                    <Icon size={15} />
                  </div>
                  <div>
                    <p className={`text-[13px] font-medium ${enabled ? "text-fg" : "text-fg-dim"}`}>
                      {source.label}
                    </p>
                    <p className="text-[11px] text-fg-muted">{source.blurb}</p>
                  </div>
                </div>
                <Toggle
                  checked={enabled}
                  onChange={(checked) => setEnabled(source.key, checked)}
                  label={`Toggle ${source.label}`}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Slider
                  value={weight}
                  onChange={(n) => setSource(source.key, n)}
                  disabled={!enabled}
                  aria-label={`${source.label} weight`}
                />
                <span
                  className={`w-10 shrink-0 text-right font-mono text-[12px] tabular-nums ${
                    enabled ? "text-fg" : "text-fg-dim"
                  }`}
                >
                  {enabled ? `${share.toFixed(0)}%` : "off"}
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
      <Dialog.Trigger className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg">
        <SlidersHorizontal size={13} /> Advanced
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-xl2 border border-line bg-panel p-6 shadow-lift">
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
