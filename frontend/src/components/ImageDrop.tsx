"use client";

import { ImagePlus, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 12 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageDrop({
  file,
  onFile,
  onClear
}: {
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function accept(next?: File | null) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setLocalError("That file isn't an image. Try a JPG, PNG, or WebP.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setLocalError(`Image is ${formatSize(next.size)} — please keep it under 12 MB.`);
      return;
    }
    setLocalError(null);
    onFile(next);
  }

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const pasted = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/")
      );
      if (pasted) accept(pasted);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2.5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`group relative flex min-h-[300px] cursor-pointer items-center justify-center overflow-hidden rounded-xl2 border bg-panel transition-all duration-200 sm:min-h-[360px] ${
          dragging
            ? "border-accent shadow-glow"
            : "border-dashed border-line-strong hover:border-fg-dim"
        }`}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Query preview"
              className="max-h-[440px] max-w-full object-contain p-3"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <span className="truncate rounded-md bg-ink/80 px-2.5 py-1 font-mono text-[11px] text-fg-muted backdrop-blur">
                {file?.name} · {file ? formatSize(file.size) : ""}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    inputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-line bg-ink/80 px-2.5 py-1 text-[11px] text-fg-muted backdrop-blur transition-colors hover:text-fg"
                >
                  <RefreshCw size={12} /> Replace
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLocalError(null);
                    onClear();
                  }}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-line bg-ink/80 text-fg-muted backdrop-blur transition-colors hover:text-danger"
                  aria-label="Remove image"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-8 text-center">
            <div
              className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-200 ${
                dragging
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-elevated text-fg-muted group-hover:text-fg"
              }`}
            >
              <ImagePlus size={24} />
            </div>
            <p className="text-[15px] font-medium text-fg">
              {dragging ? "Drop to analyze" : "Drop an image, paste, or click to browse"}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-fg-muted">
              A sports photo, a snapshot, a meme — anything works. JPG, PNG, or WebP up to 12 MB.
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />
      </div>
      {localError && (
        <p className="flex items-center gap-2 px-1 text-[13px] text-danger">
          <X size={14} /> {localError}
        </p>
      )}
    </div>
  );
}
