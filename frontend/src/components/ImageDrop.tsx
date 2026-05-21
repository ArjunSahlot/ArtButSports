"use client";

import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ImageDrop({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function accept(file?: File) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onFile(file);
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) accept(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        accept(event.dataTransfer.files[0]);
      }}
      className="relative flex min-h-[330px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-600 bg-panel p-8 shadow-[0_0_90px_rgba(55,255,180,0.12)]"
      onClick={() => inputRef.current?.click()}
    >
      {preview ? (
        <img src={preview} alt="Query preview" className="max-h-[430px] max-w-full rounded-md object-contain" />
      ) : (
        <div className="text-center">
          <Upload className="mx-auto mb-5 text-zinc-300" size={34} />
          <p className="text-lg font-medium">Upload, drop, or paste an image</p>
          <p className="mt-2 text-sm text-zinc-400">The image is processed in memory and discarded after the request.</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => accept(event.target.files?.[0])} />
    </div>
  );
}

