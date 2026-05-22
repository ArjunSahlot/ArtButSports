export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type WeightPayload = {
  sources: Record<string, number>;
  enabled: Record<string, boolean>;
  composition: Record<string, number>;
  color: Record<string, number>;
};

export type ArtResult = {
  id: string;
  image_url: string;
  title?: string;
  creators?: string;
  accession_number?: string;
  scores: Record<string, number | null>;
};

export type QueryResponse = {
  items: ArtResult[];
  offset: number;
  next_offset: number;
  total: number;
};

export type DemoImage = {
  name: string;
  filename: string;
  url: string;
};

export const defaultWeights: WeightPayload = {
  sources: { embeddings: 0.46, composition: 0.22, color: 0.22, pose: 0.1 },
  enabled: { embeddings: true, composition: true, color: true, pose: true },
  composition: { saliency: 0.7, edges: 0.3 },
  color: { lab: 0.4, palette: 0.3, warmcool: 0.1, contrast: 0.2 }
};

async function failure(res: Response): Promise<never> {
  let detail = `Request failed (${res.status})`;
  try {
    const body = await res.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        detail = parsed.detail ?? body;
      } catch {
        detail = body;
      }
    }
  } catch {
    /* keep default */
  }
  throw new Error(detail);
}

export async function queryArt(
  file: File,
  weights: WeightPayload,
  offset = 0,
  limit = 30
): Promise<QueryResponse> {
  const body = new FormData();
  body.append("image", file);
  body.append("weights", JSON.stringify(weights));
  body.append("offset", String(offset));
  body.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/query`, { method: "POST", body });
  if (!res.ok) return failure(res);
  return res.json();
}

export async function queryDemo(
  filename: string,
  weights: WeightPayload,
  offset = 0,
  limit = 30
): Promise<QueryResponse> {
  const body = new FormData();
  body.append("filename", filename);
  body.append("weights", JSON.stringify(weights));
  body.append("offset", String(offset));
  body.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/query/demo`, { method: "POST", body });
  if (!res.ok) return failure(res);
  return res.json();
}

export async function visualizeStep(file: File, step: string) {
  const body = new FormData();
  body.append("image", file);
  body.append("step", step);
  const res = await fetch(`${API_BASE}/visualize/step`, { method: "POST", body });
  if (!res.ok) return failure(res);
  return res.json();
}

export async function visualizeSample(step: string) {
  const res = await fetch(`${API_BASE}/visualize/sample/${step}`);
  if (!res.ok) return failure(res);
  return res.json();
}

export async function listDemos(): Promise<DemoImage[]> {
  const res = await fetch(`${API_BASE}/demos`);
  if (!res.ok) return failure(res);
  const data = await res.json();
  return data.items ?? [];
}


export function absoluteImageUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}
