FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY orchestrator/package*.json ./orchestrator/
RUN cd orchestrator && npm ci
COPY orchestrator/ ./orchestrator/
RUN cd orchestrator && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/orchestrator/dist ./dist
COPY --from=builder /app/orchestrator/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
