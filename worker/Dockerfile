FROM node:20-alpine AS base

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY dist ./dist

ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/pvai

RUN mkdir -p /tmp/pvai

CMD ["node", "dist/index.js"]
