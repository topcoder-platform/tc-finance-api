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
case "${RESET_DB:-false}" in
    true|TRUE|1|yes|YES)
        printf '%s\n' "Resetting DB"
        "$prisma_cli" migrate reset --force
        ;;
    false|FALSE|0|no|NO|'')
        printf '%s\n' "Running migrations"
        "$prisma_cli" migrate deploy
        ;;
    *)
        printf 'Invalid RESET_DB value: %s\n' "$RESET_DB" >&2
        exit 64
        ;;
esac

exec node dist/main.js
