# syntax=docker/dockerfile:1

# Node 24 LTS with the existing Prisma 6 client contract.
ARG NODE_IMAGE=node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85

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

FROM ${NODE_IMAGE} AS runtime

ARG SEED_DATA_ARG=""

ENV NODE_ENV=production \
    SEED_DATA=$SEED_DATA_ARG \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

WORKDIR /app

# The runtime invokes Node and the local Prisma executable directly. Remove the
# bundled package managers, their vulnerable dependency trees, and build headers.
RUN apk upgrade --no-cache \
    && rm -rf \
      /opt/yarn-v1.22.22 \
      /usr/local/include/node \
      /usr/local/lib/node_modules/corepack \
      /usr/local/lib/node_modules/npm \
    && rm -f \
      /usr/local/bin/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/appStartUp.sh ./appStartUp.sh
RUN chmod 0555 ./appStartUp.sh

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const base=(process.env.API_BASE||'/v6/finance').replace(/\\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+base+'/healthcheck').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["./appStartUp.sh"]
