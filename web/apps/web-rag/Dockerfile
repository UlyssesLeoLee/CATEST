# syntax=docker/dockerfile:1
# Dockerfile for web-rag — maps to catest-embedding/Neo4j backend, port 3002 -> 33002

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
COPY apps/web-rag/package.json ./apps/web-rag/
RUN pnpm install --frozen-lockfile --filter=web-rag...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-rag/node_modules ./apps/web-rag/node_modules
COPY . .
WORKDIR /app/apps/web-rag
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-rag/public ./public
COPY --from=builder /app/apps/web-rag/.next/standalone ./
COPY --from=builder /app/apps/web-rag/.next/static ./.next/static
EXPOSE 3002
CMD ["node", "server.js"]
