# syntax=docker/dockerfile:1
# Dockerfile for web-workspace — maps to catest-gateway workspace API, port 3001 -> 33001

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
COPY apps/web-workspace/package.json ./apps/web-workspace/
RUN pnpm install --frozen-lockfile --filter=web-workspace...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-workspace/node_modules ./apps/web-workspace/node_modules
COPY . .
WORKDIR /app/apps/web-workspace
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-workspace/public ./public
COPY --from=builder /app/apps/web-workspace/.next/standalone ./
COPY --from=builder /app/apps/web-workspace/.next/static ./.next/static
EXPOSE 3001
CMD ["node", "server.js"]
