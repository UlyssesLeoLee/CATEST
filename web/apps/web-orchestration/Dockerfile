FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
ENV NEXT_PUBLIC_SAAS_MODE=true
RUN pnpm --filter=web-orchestration build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-orchestration/public ./apps/web-orchestration/public
COPY --from=0 /app/apps/web-orchestration/.next/standalone ./
COPY --from=0 /app/apps/web-orchestration/.next/static ./apps/web-orchestration/.next/static
EXPOSE 3000
CMD ["node", "apps/web-orchestration/server.js"]
