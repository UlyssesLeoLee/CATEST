# syntax=docker/dockerfile:1
# Dockerfile for web-base (Dashboard) — port 3000 -> 33000

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
COPY apps/web-base/package.json ./apps/web-base/
RUN pnpm install --frozen-lockfile --filter=web-base...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-base/node_modules ./apps/web-base/node_modules
COPY . .
WORKDIR /app/apps/web-base
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-base/public ./public
COPY --from=builder /app/apps/web-base/.next/standalone ./
COPY --from=builder /app/apps/web-base/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
