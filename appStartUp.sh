#!/bin/sh
set -eu

DATABASE_URL=$(printf '%b' "${DATABASE_URL:-}")
export DATABASE_URL

prisma_cli=./node_modules/.bin/prisma
if [ ! -x "$prisma_cli" ]; then
    printf '%s\n' "Prisma CLI is not installed in the production dependencies." >&2
    exit 1
fi

printf '%s\n' "Database - running migrations."
"$prisma_cli" migrate deploy

exec node dist/main.js
