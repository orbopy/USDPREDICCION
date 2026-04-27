FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY llm-interpreter/package*.json ./llm-interpreter/
RUN cd llm-interpreter && npm ci
COPY llm-interpreter/ ./llm-interpreter/
RUN cd llm-interpreter && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/llm-interpreter/dist ./dist
COPY --from=builder /app/llm-interpreter/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
