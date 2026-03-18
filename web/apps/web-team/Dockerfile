# syntax=docker/dockerfile:1
# Dockerfile for web-team Portal — port 3004 -> 33004

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
COPY apps/web-team/package.json ./apps/web-team/
RUN pnpm install --frozen-lockfile --filter=web-team...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-team/node_modules ./apps/web-team/node_modules
COPY . .
WORKDIR /app/apps/web-team
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-team/public ./public
COPY --from=builder /app/apps/web-team/.next/standalone ./
COPY --from=builder /app/apps/web-team/.next/static ./.next/static
EXPOSE 3004
CMD ["node", "server.js"]
