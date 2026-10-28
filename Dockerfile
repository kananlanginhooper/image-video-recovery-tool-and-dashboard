# Media library: builds the Angular UI, then runs the FastAPI app that serves it and the /api/.
# UI_CONFIG=private builds with the UI plugins in ui/src/private (not in git); the API loads api/private/*.py either way.
FROM node:20.19-slim AS ui
ARG UI_CONFIG=production
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npx ng build --configuration "$UI_CONFIG"

FROM python:3.13-slim
# vips makes image thumbnails and viewer JPEGs, ffmpeg makes video thumbnails and frames
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libvips-tools \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY api/requirements.txt api/
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api/ api/
COPY --from=ui /ui/dist/media/browser ui/dist/media/browser
ENV MEDIA_DB_CNF=/run/secrets/db.cnf MEDIA_CACHE=/cache MEDIA_UI_DIR=/app/ui/dist/media/browser \
    MEDIA_HOST=0.0.0.0 MEDIA_PORT=8093
WORKDIR /app/api
CMD ["sh", "-c", "exec uvicorn app:app --host \"$MEDIA_HOST\" --port \"$MEDIA_PORT\" --no-access-log"]
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"MEDIA_PORT\"]}/api/health',timeout=8)"
