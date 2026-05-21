"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Settings, RotateCcw } from "lucide-react";
import { defaultWeights, type WeightPayload } from "@/lib/api";

const sourceLabels = ["embeddings", "composition", "color", "pose"];
const colorLabels = ["lab", "palette", "warmcool", "contrast"];
const compositionLabels = ["saliency", "edges"];

export function Weights({ value, onChange }: { value: WeightPayload; onChange: (next: WeightPayload) => void }) {
  function setSource(name: string, weight: number) {
    onChange({ ...value, sources: { ...value.sources, [name]: weight } });
  }
  function setEnabled(name: string, enabled: boolean) {
    onChange({ ...value, enabled: { ...value.enabled, [name]: enabled } });
  }
  function setNested(group: "color" | "composition", name: string, weight: number) {
    onChange({ ...value, [group]: { ...value[group], [name]: weight } });
  }
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="grid gap-4 lg:grid-cols-4">
        {sourceLabels.map((name) => (
          <label key={name} className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="capitalize text-zinc-200">{name}</span>
              <input type="checkbox" checked={value.enabled[name]} onChange={(event) => setEnabled(name, event.target.checked)} />
            </div>
            <input className="w-full accent-glow" type="range" min="0" max="1" step="0.01" value={value.sources[name]} onChange={(event) => setSource(name, Number(event.target.value))} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm" onClick={() => onChange(defaultWeights)}>
          <RotateCcw size={15} /> Defaults
        </button>
        <Dialog.Root>
          <Dialog.Trigger className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <Settings size={15} /> Settings
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(620px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-6">
              <Dialog.Title className="text-lg font-semibold">Granular Weights</Dialog.Title>
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm text-zinc-400">Color</h3>
                  {colorLabels.map((name) => (
                    <Slider key={name} label={name} value={value.color[name]} onChange={(n) => setNested("color", name, n)} />
                  ))}
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm text-zinc-400">Composition</h3>
                  {compositionLabels.map((name) => (
                    <Slider key={name} label={name} value={value.composition[name]} onChange={(n) => setNested("composition", name, n)} />
                  ))}
                  <p className="text-sm text-zinc-400">Pose uses detected skeleton angle similarity when both images contain a confident person.</p>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <div className="mb-2 flex justify-between">
        <span className="capitalize">{label}</span>
        <span className="text-zinc-400">{value.toFixed(2)}</span>
      </div>
      <input className="w-full accent-roseglow" type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

