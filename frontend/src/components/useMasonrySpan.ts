"use client";

import { type RefObject, useEffect } from "react";

const ROW_HEIGHT = 8;
const GAP = 20;

export function useMasonrySpan<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const height = node.getBoundingClientRect().height;
      const span = Math.max(1, Math.ceil((height + GAP) / (ROW_HEIGHT + GAP)));
      node.style.setProperty("--masonry-span", String(span));
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);

    const images = Array.from(node.querySelectorAll("img"));
    for (const image of images) {
      if (!image.complete) {
        image.addEventListener("load", update);
        image.addEventListener("error", update);
      }
    }
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      for (const image of images) {
        image.removeEventListener("load", update);
        image.removeEventListener("error", update);
      }
    };
  }, [ref]);
}
