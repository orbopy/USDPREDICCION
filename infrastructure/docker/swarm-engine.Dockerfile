FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY swarm-engine/package*.json ./swarm-engine/
RUN cd swarm-engine && npm ci
COPY swarm-engine/ ./swarm-engine/
RUN cd swarm-engine && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/swarm-engine/dist ./dist
COPY --from=builder /app/swarm-engine/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
