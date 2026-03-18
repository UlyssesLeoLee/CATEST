# syntax=docker/dockerfile:1
# Dockerfile for web-review — builds ONLY the web-review app from the monorepo
# Maps to: catest-review K8s service, port 3003 -> 33003

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
# Copy workspace manifests
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
# Copy only the package manifests of the apps we need (avoid copying all source)
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
COPY apps/web-review/package.json ./apps/web-review/
# Install: only web-review and its workspace deps
RUN pnpm install --frozen-lockfile --filter=web-review...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-review/node_modules ./apps/web-review/node_modules
COPY . .
WORKDIR /app/apps/web-review
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-review/public ./public
COPY --from=builder /app/apps/web-review/.next/standalone ./
COPY --from=builder /app/apps/web-review/.next/static ./.next/static
EXPOSE 3003
CMD ["node", "server.js"]
