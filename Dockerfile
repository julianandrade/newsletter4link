# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Multi-stage build for Next.js 16 (standalone) on Cloud Run.
#
# Base image choice: node:22-slim (Debian) rather than alpine. This app uses
# the `pg` driver over TLS to Cloud SQL and ships no native image pipeline
# (no `sharp`), so the musl/openssl friction of alpine buys us nothing while
# slim gives a more predictable glibc/openssl stack for pg + Prisma. The image
# stays small because the runner only carries the standalone server output.
# ---------------------------------------------------------------------------

# ===========================================================================
# Stage 1, deps: install node_modules (postinstall runs `prisma generate`)
# ===========================================================================
FROM node:22-slim AS deps
WORKDIR /app

# `prisma generate` (postinstall) needs the schema + prisma.config.ts present.
# prisma.config.ts imports dotenv/config and reads process.env.DIRECT_URL, but
# the datasource block in schema.prisma has no url/env() (driver-adapter at
# runtime), so generate does NOT require a live DB. We still pass a dummy
# DIRECT_URL so dotenv/prisma.config never see an undefined value during build.
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

# ===========================================================================
# Stage 2, build: compile the Next.js standalone output
# ===========================================================================
FROM node:22-slim AS build
WORKDIR /app

# NEXT_PUBLIC_* values are INLINED into the client bundle at build time, so they
# must be supplied here (not at runtime). The deploy workflow passes real values
# via --build-arg; these defaults only keep a bare `docker build` from failing.
ARG NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"
ARG NEXT_PUBLIC_APP_URL="https://newsletter4link.vercel.app"

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# `npm run build` runs `prisma generate && next build`; dummy DIRECT_URL again.
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Turns on `output: "standalone"` in next.config.ts, which is what the runner stage's
# `COPY .next/standalone` needs. It is a flag rather than an unconditional setting so that
# the Vercel build, which still serves production, is unchanged by this migration. See the
# comment in next.config.ts.
ENV BUILD_STANDALONE=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ===========================================================================
# Stage 3, runner: minimal runtime carrying only the standalone server
# ===========================================================================
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT (defaults to 8080); Next standalone server.js honors it.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Run as a non-root user (defense in depth).
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output: server.js + a trimmed node_modules + package.json.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets and public/ are NOT bundled into standalone; copy them in.
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
