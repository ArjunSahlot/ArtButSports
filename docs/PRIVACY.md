# Privacy

Uploaded query images are processed in memory for the current FastAPI request and then discarded. The backend does not write uploads to disk, does not include upload bytes in logs, and does not add user images to the feature table.

The only query-time external call is the Gemini image embedding request for the uploaded image. Corpus embeddings are precomputed by the operator before deployment.

CORS is restricted to `http://localhost:3000` for local development and the optional `FRONTEND_ORIGIN` environment variable for production. Do not set `FRONTEND_ORIGIN=*`.

The `.env` file is gitignored and must contain secrets such as `GEMINI_API_KEY`. Never commit `.env` or feature build logs containing credentials.

