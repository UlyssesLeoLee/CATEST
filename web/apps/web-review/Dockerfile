FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
ENV NEXT_PUBLIC_SAAS_MODE=true
RUN pnpm --filter=web-review build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-review/public ./apps/web-review/public
COPY --from=0 /app/apps/web-review/.next/standalone ./
COPY --from=0 /app/apps/web-review/.next/static ./apps/web-review/.next/static
EXPOSE 3003
CMD ["node", "apps/web-review/server.js"]
