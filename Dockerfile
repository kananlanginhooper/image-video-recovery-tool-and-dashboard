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
    MEDIA_HOST=0.0.0.0 MEDIA_PORT=8093 FORWARDED_ALLOW_IPS=127.0.0.1
WORKDIR /app/api
# --proxy-headers: behind a reverse proxy (TLS ending there), X-Forwarded-Proto/For from FORWARDED_ALLOW_IPS are honored
CMD ["sh", "-c", "exec uvicorn app.main:app --host \"$MEDIA_HOST\" --port \"$MEDIA_PORT\" --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\" --no-access-log"]
# probe the address the app listens on: MEDIA_HOST may be a LAN address only; 0.0.0.0 (any) is probed as 127.0.0.1
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD python -c "import os,urllib.request;h=os.environ['MEDIA_HOST'];h='127.0.0.1' if h in ('0.0.0.0','') else h;urllib.request.urlopen(f'http://{h}:{os.environ[\"MEDIA_PORT\"]}/api/health',timeout=8)"
