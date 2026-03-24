# Stage 1: build (needs devDependencies for @types/*)
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Stage 2: production (no devDependencies)
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/explorer-hub.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
