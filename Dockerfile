# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

FROM ${NODE_IMAGE} AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

WORKDIR /app

RUN apk upgrade --no-cache && npm install -g pnpm@11.15.1

COPY . .

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm run build && pnpm test --runInBand && pnpm test:dependency-compat
RUN pnpm prune --prod
# Git dependencies may ship their own Dockerfiles. They are not runtime assets,
# and retaining them causes image-level misconfiguration scanners to inspect
# unrelated container definitions.
RUN find node_modules -type f -name 'Dockerfile*' -delete

FROM alpine:3.24 AS runtime

ARG SEED_DATA_ARG=""

ENV NODE_ENV=production \
    SEED_DATA=$SEED_DATA_ARG \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

WORKDIR /app

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates 'nodejs-current~26.13.1' 'zlib>=1.4-r0' 'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' \
    && addgroup -S -g 1000 node \
    && adduser -S -D -u 1000 -G node node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/appStartUp.sh ./appStartUp.sh
RUN chmod 0555 ./appStartUp.sh

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const base=(process.env.API_BASE||'/v6/finance').replace(/\\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+base+'/healthcheck').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["./appStartUp.sh"]
