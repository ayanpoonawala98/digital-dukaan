# API image for the VPS (deploy/docker-compose.yml). Build context is the repository root, because the
# lockfile that matters is the root workspace package-lock.json. Debian slim, not Alpine, so sharp uses its glibc prebuilt.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w digital-dukaan-server && npm cache clean --force
COPY server/ server/
WORKDIR /app/server
# Local-disk image fallback writes here when ImageKit is not configured.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
