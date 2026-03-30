FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
ENV NEXT_PUBLIC_SAAS_MODE=true
RUN pnpm --filter=web-tm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-tm/public ./apps/web-tm/public
COPY --from=0 /app/apps/web-tm/.next/standalone ./
COPY --from=0 /app/apps/web-tm/.next/static ./apps/web-tm/.next/static
EXPOSE 3005
CMD ["node", "apps/web-tm/server.js"]
