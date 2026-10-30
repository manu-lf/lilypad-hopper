FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js demo-auth.cjs ./
COPY .env* ./
COPY public ./public
# Host files can arrive with restrictive perms (700 dirs from a synced folder);
# make them readable/traversable by the non-root 'node' user. Without this the
# page loads index.html but 404s on /vendor, /js, /assets.
RUN chmod -R a+rX /app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/healthz" >/dev/null 2>&1 || exit 1
USER node
CMD ["node","server.js"]
