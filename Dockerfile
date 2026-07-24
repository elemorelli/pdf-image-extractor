FROM node:24-alpine

RUN apk add --no-cache bash coreutils poppler-utils imagemagick libwebp-tools

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY pdf_extract.sh webp_convert.sh ./
RUN chmod +x pdf_extract.sh webp_convert.sh

RUN npm run build:frontend
RUN npm prune --omit=dev

ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://localhost:${PORT}/api/config" || exit 1

CMD ["node", "server/index.ts"]
