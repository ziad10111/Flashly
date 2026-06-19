# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS check
COPY . .
RUN npm run build:server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=check /app/app.json ./app.json
COPY --from=check /app/babel.config.js ./babel.config.js
COPY --from=check /app/metro.config.js ./metro.config.js
COPY --from=check /app/tsconfig.json ./tsconfig.json
COPY --from=check /app/src ./src
COPY --from=check /app/assets ./assets
COPY --from=check /app/fixtures ./fixtures
COPY --from=check /app/scripts ./scripts

RUN chown -R node:node /app
USER node

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8081) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start:server"]
