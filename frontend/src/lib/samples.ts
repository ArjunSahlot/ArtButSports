export type DemoImage = {
  name: string;
  filename: string;
  url: string;
};

export type VisualizeSample = {
  before: string;
  after?: string;
};

const EMBEDDING_VECTOR_SVG =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjMyMCIgdmlld0JveD0iMCAwIDMyMCAzMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgYXJpYS1sYWJlbD0iRW1iZWRkaW5nIHZlY3RvciI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJhIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzExMTExNCIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzA1MDUwNiIvPjwvbGluZWFyR3JhZGllbnQ+PGZpbHRlciBpZD0iYiIgeD0iLTMwJSIgeT0iLTMwJSIgd2lkdGg9IjE2MCUiIGhlaWdodD0iMTYwJSI+PGZlRHJvcFNoYWRvdyBkeD0iMCIgZHk9IjAiIHN0ZERldmlhdGlvbj0iOCIgZmxvb2QtY29sb3I9IiNlN2E5NGUiIGZsb29kLW9wYWNpdHk9Ii4yOCIvPjwvZmlsdGVyPjwvZGVmcz48cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjMyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2EpIi8+PHJlY3QgeD0iNzIiIHk9IjQ4IiB3aWR0aD0iMTc2IiBoZWlnaHQ9IjIyNCIgcng9IjIyIiBmaWxsPSIjMTUxNTE5IiBzdHJva2U9IiMyYTJhMzEiLz48cGF0aCBkPSJNMTEyIDgySDkydjE1NmgyMG05Ni0xNTZoMjB2MTU2aC0yMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZjRmNGYzIiBzdHJva2Utb3BhY2l0eT0iLjcyIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxnIGZpbHRlcj0idXJsKCNiKSI+PHJlY3QgeD0iMTI1IiB5PSI3OCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9IiNlN2E5NGUiIGZpbGwtb3BhY2l0eT0iLjE2IiBzdHJva2U9IiNlN2E5NGUiIHN0cm9rZS1vcGFjaXR5PSIuMzUiLz48cmVjdCB4PSIxMjUiIHk9IjEyMiIgd2lkdGg9IjcwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9IiNmMmMxNzgiIGZpbGwtb3BhY2l0eT0iLjEzIiBzdHJva2U9IiNmMmMxNzgiIHN0cm9rZS1vcGFjaXR5PSIuMjgiLz48cmVjdCB4PSIxMjUiIHk9IjIxMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjMyIiByeD0iMTAiIGZpbGw9IiNlN2E5NGUiIGZpbGwtb3BhY2l0eT0iLjE2IiBzdHJva2U9IiNlN2E5NGUiIHN0cm9rZS1vcGFjaXR5PSIuMzUiLz48L2c+PHJlY3QgeD0iMTI1IiB5PSIxNjYiIHdpZHRoPSI3MCIgaGVpZ2h0PSIzMiIgcng9IjEwIiBmaWxsPSIjMjIyMjI5Ii8+PHRleHQgeD0iMTYwIiB5PSIxMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJ1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgQ29uc29sYXMsIG1vbm9zcGFjZSIgZm9udC1zaXplPSIxNSIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI2YyYzE3OCI+MC43MzwvdGV4dD48dGV4dCB4PSIxNjAiIHk9IjE0NCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBDb25zb2xhcywgbW9ub3NwYWNlIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZjJjMTc4Ij4tMS4yNDwvdGV4dD48dGV4dCB4PSIxNjAiIHk9IjE5MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsIHNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOGI4Yjk1Ij7ii648L3RleHQ+PHRleHQgeD0iMTYwIiB5PSIyMzIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJ1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgQ29uc29sYXMsIG1vbm9zcGFjZSIgZm9udC1zaXplPSIxNSIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI2YyYzE3OCI+MC4xODwvdGV4dD48L3N2Zz4=";

function demoName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const DEMO_FILES = [
  "1.png",
  "bye.png",
  "forward.png",
  "head2head.png",
  "sideways.png",
  "soccer.png",
  "upsidedown.png",
  "wemby.png",
  "wnba.png"
] as const;

export const DEMO_IMAGES: DemoImage[] = DEMO_FILES.map((filename) => ({
  name: demoName(filename),
  filename,
  url: `/demos/${filename}`
}));

const VISUALIZE_BEFORE = "/visualize-samples/demo.png";

export const VISUALIZE_SAMPLES: Record<string, VisualizeSample> = {
  embeddings: {
    before: VISUALIZE_BEFORE,
    after: EMBEDDING_VECTOR_SVG
  },
  composition: {
    before: VISUALIZE_BEFORE,
    after: "/visualize-samples/demo_composition.png"
  },
  color: {
    before: VISUALIZE_BEFORE,
    after: "/visualize-samples/demo_color.png"
  },
  pose: {
    before: VISUALIZE_BEFORE,
    after: "/visualize-samples/demo_pose.png"
  }
};
