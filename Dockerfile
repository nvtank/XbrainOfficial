# ─────────────────────────────────────────────────────────────
#  XBrain Virtual Office — single production image
#  Game server (Colyseus + REST API) also serves the built web client.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY packages ./packages
COPY apps ./apps
# Build-time web settings (empty = same origin as the page)
ARG VITE_SERVER_URL=""
ARG VITE_LOGO_URL="/assets/xbrain-logo.webp"
ENV VITE_SERVER_URL=$VITE_SERVER_URL VITE_LOGO_URL=$VITE_LOGO_URL
RUN npx prisma generate --schema prisma/schema.prisma \
 && npm run build -w @xbrain/web \
 && npm run build -w @xbrain/server \
 && npm prune --omit=dev \
 && npm install --no-save --no-audit --no-fund prisma@5.22.0 \
 && npx prisma generate --schema prisma/schema.prisma

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SERVER_PORT=2567 SERVE_WEB=/app/apps/web/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/apps/server/data && chown -R node:node /app
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.SERVER_PORT||2567)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
