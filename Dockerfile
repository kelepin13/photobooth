# syntax=docker/dockerfile:1

# --- build: install everything, fetch MediaPipe assets, compile Next.js ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `npm run build` runs scripts/fetch-mediapipe.mjs first (prebuild)
RUN npm run build && npm prune --omit=dev

# --- runtime: production dependencies and build output only ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server.js /app/next.config.js ./
COPY --from=build --chown=node:node /app/lib ./lib

# Published strips (without S3) go to /app/data/strips; mount a volume there to keep them.
RUN mkdir -p /app/data/strips && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
