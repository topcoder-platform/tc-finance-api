# syntax=docker/dockerfile:1

# node:22-alpine, resolved 2026-07-29 to Node.js 22.23.2 on Alpine 3.24.
ARG NODE_IMAGE=node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

FROM ${NODE_IMAGE} AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm run build
RUN pnpm prune --prod
# Git dependencies may ship their own Dockerfiles. They are not runtime assets,
# and retaining them causes image-level misconfiguration scanners to inspect
# unrelated container definitions.
RUN find node_modules -type f -name 'Dockerfile*' -delete

FROM ${NODE_IMAGE} AS runtime

ARG RESET_DB_ARG=false
ARG SEED_DATA_ARG=""

ENV NODE_ENV=production \
    RESET_DB=$RESET_DB_ARG \
    SEED_DATA=$SEED_DATA_ARG \
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

WORKDIR /app

# The runtime invokes Node and the local Prisma executable directly. Remove the
# bundled package managers, their vulnerable dependency trees, and build headers.
RUN rm -rf \
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
COPY --from=builder --chown=node:node --chmod=0555 /app/appStartUp.sh ./appStartUp.sh

USER node

CMD ["./appStartUp.sh"]
